{ pkgs, lib, config, ... }:

let
  # Registry configuration
  giteaHost = "gitea.cnoe.localtest.me:8443";
  giteaUser = "giteaadmin";
  devcontainerImage = "${giteaUser}/ai-chatbot-devspace";
in
{
  # Environment variables for development
  # Includes registry config, OTEL settings, and devspace configuration
  env = {
    # Registry configuration
    GITEA_HOST = giteaHost;
    GITEA_USER = giteaUser;
    DEVCONTAINER_IMAGE = "${giteaHost}/${devcontainerImage}";

    # OpenTelemetry SDK auto-configuration
    # Apps using @opentelemetry/sdk-* will automatically send to local collector
    # Note: Using non-standard ports (4400/4401) to avoid conflict with system grafana-alloy on 4317/4318
    OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4401";
    OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf";
    OTEL_SERVICE_NAME = "ai-chatbot-dev";
    OTEL_RESOURCE_ATTRIBUTES = "deployment.environment=development,service.namespace=ai-chatbot-dev";
  };

  # OpenTelemetry Collector - forwards telemetry to K8s observability stack
  # Receives: local apps on localhost:4400 (gRPC) / 4401 (HTTP) - non-standard to avoid grafana-alloy conflict
  # Exports: K8s otel-collector via port-forward on localhost:14317/14318
  # K8s collector routes to: Tempo (traces), Mimir (metrics), Loki (logs)
  services.opentelemetry-collector = {
    enable = true;
    settings = {
      receivers = {
        otlp = {
          protocols = {
            grpc.endpoint = "0.0.0.0:4400";
            http.endpoint = "0.0.0.0:4401";
          };
        };
      };

      processors = {
        batch = {
          timeout = "5s";
          send_batch_size = 1000;
        };
        resource = {
          attributes = [
            { key = "deployment.environment"; value = "development"; action = "insert"; }
            { key = "service.namespace"; value = "ai-chatbot-dev"; action = "insert"; }
          ];
        };
      };

      exporters = {
        # Forward to K8s OTEL collector via port-forward
        otlp = {
          endpoint = "localhost:14317";
          tls.insecure = true;
        };
        # Debug exporter for local troubleshooting
        debug = {
          verbosity = "basic";
        };
      };

      service = {
        pipelines = {
          traces = {
            receivers = [ "otlp" ];
            processors = [ "batch" "resource" ];
            exporters = [ "otlp" ];
          };
          metrics = {
            receivers = [ "otlp" ];
            processors = [ "batch" "resource" ];
            exporters = [ "otlp" ];
          };
          logs = {
            receivers = [ "otlp" ];
            processors = [ "batch" "resource" ];
            exporters = [ "otlp" ];
          };
        };
      };
    };
  };

  packages = [
    pkgs.git
    pkgs.jq
    pkgs.kubectl
    pkgs.psmisc  # Provides fuser for killing port processes
    pkgs.otel-cli  # For build instrumentation (traces/metrics to OTEL collector)
    pkgs.devspace  # Kubernetes development with file sync
    # Build tools for native Node.js modules
    pkgs.gnumake
    pkgs.gcc
    pkgs.python3
    # Required for container builds
    pkgs.gnutar
    pkgs.gzip
    pkgs.coreutils
    pkgs.bashInteractive
    pkgs.cacert
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    corepack.enable = true;
    pnpm = {
      enable = true;
      install.enable = true;
    };
  };

  # Development processes - run with 'devenv up'
  # Process-compose is the default process manager
  processes = {
    # Cleanup stale processes on OTEL ports before collector starts
    # Prevents "address already in use" errors from previous sessions
    otel-cleanup.exec = ''
      echo "Cleaning up stale OTEL ports..."
      fuser -k 4400/tcp 4401/tcp 2>/dev/null || true
      sleep 1
      exec echo "OTEL ports cleaned up"
    '';

    # Wait for port cleanup to complete before starting collector
    opentelemetry-collector.process-compose.depends_on.otel-cleanup.condition = "process_completed_successfully";

    # Port-forward K8s OTEL collector for local telemetry forwarding
    # Local OTEL collector (4400/4401) -> K8s OTEL collector (14317/14318)
    # K8s collector routes to: Tempo, Mimir, Loki
    otel-forward.exec = ''
      echo "Port-forwarding K8s OTEL collector..."
      echo "  Local collector:  localhost:4400 (gRPC) / 4401 (HTTP)"
      echo "  K8s collector:    localhost:14317 -> otel-collector.observability:4317"
      echo ""
      fuser -k 14317/tcp 14318/tcp 2>/dev/null || true
      exec kubectl port-forward -n observability svc/otel-collector 14317:4317 14318:4318
    '';

    # NOTE: Local dev server removed - use devspace for K8s-based development
    # For simple local dev without K8s, run: pnpm dev

    # DevSpace - Kubernetes development with file sync and hot-reload
    # Replaces production container with devcontainer for development
    devspace.exec = ''
      echo "Starting DevSpace development session..."
      echo "  Target:      ai-chatbot deployment in K8s"
      echo "  Dev image:   ${giteaHost}/${devcontainerImage}:latest"
      echo "  File sync:   ./ -> /app (mirrorLocal)"
      echo "  Ports:       3000 (Next.js dev server)"
      echo ""

      # Clear any stale devspace state
      rm -rf .devspace/generated 2>/dev/null || true

      # Kill any process using port 3000 (local dev server conflict)
      fuser -k 3000/tcp 2>/dev/null || true
      sleep 1

      # Start devspace dev session
      # If devspace exits unexpectedly, attempt to stream logs as fallback
      if ! devspace dev --namespace ai-chatbot; then
        echo ""
        echo "DevSpace exited. Attempting to stream pod logs..."
        kubectl logs -f -n ai-chatbot -l app=ai-chatbot --all-containers || true
      fi
    '';
    devspace.process-compose.depends_on.otel-forward.condition = "process_started";
  };

  scripts = {
    build = {
      exec = "pnpm build";
      description = "Build Next.js application";
    };
    docker-build = {
      exec = ''
        docker image build . -f Dockerfile --tag ai-chatbot:latest
      '';
      description = "Build Docker image";
    };
    docker-run = {
      exec = "docker run -it -p 3000:3000 ai-chatbot:latest";
      description = "Run Docker container";
    };
    build-push = {
      exec = ''./scripts/build-push.sh "$@"'';
      description = "Build and push image to Gitea (use: build-push [--trigger-kargo] VERSION)";
    };
    db-migrate = {
      exec = "pnpm db:migrate";
      description = "Run database migrations";
    };
    db-studio = {
      exec = "pnpm db:studio";
      description = "Open Drizzle Studio";
    };

    # DevContainer management scripts (uses Dockerfile.devspace)
    devcontainer-build = {
      exec = ''
        echo "Building devcontainer from Dockerfile.devspace..."
        docker build -f Dockerfile.devspace -t ${giteaHost}/${devcontainerImage}:latest .
        echo ""
        echo ">>> Devcontainer built successfully!"
        echo "    Image: ${giteaHost}/${devcontainerImage}:latest"
      '';
      description = "Build devcontainer image from Dockerfile.devspace";
    };
    devcontainer-push = {
      exec = ''
        set -e
        echo ">>> Building devcontainer from Dockerfile.devspace..."
        docker build -f Dockerfile.devspace -t ${giteaHost}/${devcontainerImage}:latest .

        echo ""
        echo ">>> Pushing devcontainer to Gitea..."
        docker push ${giteaHost}/${devcontainerImage}:latest

        echo ""
        echo ">>> Devcontainer pushed successfully!"
        echo "    Image: ${giteaHost}/${devcontainerImage}:latest"
      '';
      description = "Build and push devcontainer to Gitea registry";
    };

    # DevSpace shortcuts
    devspace-enter = {
      exec = "devspace enter --namespace ai-chatbot";
      description = "Shell into the devspace container";
    };
    devspace-purge = {
      exec = "devspace purge --namespace ai-chatbot";
      description = "Clean up devspace resources";
    };
    devspace-logs = {
      exec = "devspace logs --namespace ai-chatbot -f";
      description = "Stream logs from devspace container";
    };
  };

  enterShell = ''
    echo "=== AI Chatbot Development Environment ==="
    echo "Node: $(node --version)"
    echo "pnpm: $(pnpm --version)"
    echo ""
    echo "Development Modes:"
    echo "  devenv up                    # K8s dev (DevSpace + OTEL) - RECOMMENDED"
    echo "  pnpm dev                     # Simple local dev (no K8s)"
    echo ""
    echo "DevSpace (K8s Development):"
    echo "  devspace-enter               # Shell into K8s container"
    echo "  devspace-logs                # Stream container logs"
    echo "  devspace-purge               # Clean up devspace resources"
    echo ""
    echo "DevContainer Management:"
    echo "  devcontainer-build           # Build devcontainer from Dockerfile.devspace"
    echo "  devcontainer-push            # Build and push devcontainer to Gitea"
    echo ""
    echo "OpenTelemetry (auto-started with devenv up):"
    echo "  OTEL endpoint:   localhost:4400 (gRPC) / 4401 (HTTP)"
    echo "  K8s backends:    Tempo (traces), Mimir (metrics), Loki (logs)"
    echo "  View traces:     https://grafana.cnoe.localtest.me:8443/explore"
    echo ""
    echo "Build & Push:"
    echo "  build                        # Build Next.js app"
    echo "  docker-build                 # Build Docker image"
    echo "  build-push VERSION [OPTIONS] # Build & push to Gitea"
    echo "    --trigger-kargo            # Trigger Kargo warehouse refresh"
    echo ""
    echo "Database:"
    echo "  db-migrate                   # Run database migrations"
    echo "  db-studio                    # Open Drizzle Studio"
  '';
}
