import { NextResponse } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import { parseExecutionFileChangeData } from "@/lib/workflow-change-artifacts";
import {
	getWorkflowBuilderExecutionDetail,
	getWorkflowBuilderExecutionPatch,
} from "@/lib/workflow-builder-client";

async function resolveExecutionDetail(instanceId: string) {
	const directDetail = await getWorkflowBuilderExecutionDetail(instanceId).catch(
		() => null,
	);
	if (directDetail) {
		return directDetail;
	}

	const session = await getAgentSession({ id: instanceId }).catch(() => null);
	const linkedExecutionId = session?.workflowId?.trim();
	if (!linkedExecutionId) {
		return null;
	}

	return getWorkflowBuilderExecutionDetail(linkedExecutionId).catch(() => null);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<unknown> },
) {
	const { instanceId } = (await params) as { instanceId: string };
	const detail = await resolveExecutionDetail(instanceId);

	if (!detail) {
		return NextResponse.json(
			{ error: `Workflow with ID "${instanceId}" not found` },
			{ status: 404 },
		);
	}

	try {
		const response = await getWorkflowBuilderExecutionPatch({
			executionId: detail.execution.id,
		});
		const format = new URL(request.url).searchParams.get("format");

		if (format === "raw") {
			return new Response(response.patch || "", {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "no-store",
				},
			});
		}

		return NextResponse.json(response, {
			headers: {
				"Cache-Control": "no-store",
			},
		});
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			const format = new URL(request.url).searchParams.get("format");
			if (format === "raw") {
				return new Response("", {
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
					},
				});
			}

			return NextResponse.json(
				{
					success: true,
					executionId: detail.execution.id,
					patch: "",
					changeSets: [],
					pending: false,
				},
				{
					headers: {
						"Cache-Control": "no-store",
					},
				},
			);
		}

		const changeData = parseExecutionFileChangeData(detail.execution.output);
		const patch = changeData?.patch ?? "";
		const format = new URL(request.url).searchParams.get("format");
		if (format === "raw") {
			return new Response(patch, {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "no-store",
				},
			});
		}

		console.warn(
			"Falling back to derived workflow patch payload:",
			error instanceof Error ? error.message : String(error),
		);
		return NextResponse.json(
			{
				success: true,
				executionId: detail.execution.id,
				durableInstanceId: changeData?.durableInstanceId,
				patch,
				changeSets: changeData
					? [
							{
								changeSetId: `derived:${detail.execution.id}:${changeData.sourceNodeKey ?? "execution"}`,
								files: changeData.files,
							},
						]
					: [],
				pending:
					detail.execution.status === "running" ||
					detail.execution.status === "pending",
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	}
}
