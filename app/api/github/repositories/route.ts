import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getUserRepositories,
  getRepositoryBranches,
} from "@/lib/github";

/**
 * GET /api/github/repositories
 * Fetches repositories accessible to the authenticated user via GitHub OAuth.
 * Supports pagination via 'page' query parameter.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || !session.accessToken) {
      return NextResponse.json(
        {
          error:
            "GitHub authentication required. Please sign in with GitHub.",
        },
        { status: 401 }
      );
    }

    // Get pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = 30;

    // Get owner/repo for branches request
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    // If owner and repo are provided, fetch branches
    if (owner && repo) {
      try {
        const branches = await getRepositoryBranches(
          session.accessToken,
          owner,
          repo
        );
        return NextResponse.json({ branches });
      } catch (error) {
        console.error("Failed to fetch branches:", error);
        return NextResponse.json(
          { error: "Failed to fetch branches" },
          { status: 500 }
        );
      }
    }

    // Validate page parameter
    if (page < 1 || isNaN(page)) {
      return NextResponse.json(
        { error: "Invalid page parameter. Must be a positive integer." },
        { status: 400 }
      );
    }

    // Fetch repositories using OAuth token
    const repositoryData = await getUserRepositories(
      session.accessToken,
      page,
      perPage
    );

    // Transform the response to include only the data we need
    const transformedRepos = repositoryData.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      permissions: repo.permissions,
      fork: repo.fork,
      has_issues: repo.has_issues,
    }));

    return NextResponse.json({
      repositories: transformedRepos,
      pagination: {
        page,
        perPage,
        hasMore: repositoryData.hasMore,
        totalCount: repositoryData.totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
