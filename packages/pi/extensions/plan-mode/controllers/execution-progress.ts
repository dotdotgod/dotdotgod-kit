import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMessageText, isAssistantMessage } from "../runtime/messages.ts";
import { extractTodoItems, markCompletedSteps, type TodoItem } from "../todos.ts";

export interface ExecutionProgressSnapshot {
	todos: TodoItem[];
}

export class ExecutionProgressController {
	todos: TodoItem[] = [];

	clear(): void {
		this.todos = [];
	}

	setTodos(todos: readonly TodoItem[]): void {
		this.todos = todos.map((todo) => ({ ...todo }));
	}

	loadTodosFromPlan(cwd: string, planPath: string): TodoItem[] {
		let todos: TodoItem[] = [];
		try {
			todos = extractTodoItems(readFileSync(resolve(cwd, planPath), "utf8"));
		} catch {
			todos = [];
		}
		this.setTodos(todos);
		return this.todos;
	}

	loadTodosFromPlanOrText(cwd: string, planPath: string | undefined, fallbackText: string | undefined): TodoItem[] {
		if (planPath) {
			const todos = this.loadTodosFromPlan(cwd, planPath);
			if (todos.length > 0) return todos;
		}
		if (fallbackText) {
			const todos = extractTodoItems(fallbackText);
			if (todos.length > 0) this.setTodos(todos);
		}
		return this.todos;
	}

	markCompletedFromText(text: string): number {
		return markCompletedSteps(text, this.todos);
	}

	isComplete(): boolean {
		return this.todos.length > 0 && this.todos.every((todo) => todo.completed);
	}

	replayCompletedFromSessionEntries(entries: readonly unknown[], attemptId?: string): void {
		let executeIndex = entries.length - 1;
		for (; executeIndex >= 0; executeIndex--) {
			const entry = entries[executeIndex] as { type?: string; customType?: string; data?: { attemptId?: string } } | undefined;
			if (entry?.type === "custom" && entry.customType === "plan-mode-execute"
				&& (attemptId === undefined || entry.data?.attemptId === attemptId)) break;
		}
		if (executeIndex < 0) return;

		const messages: AgentMessage[] = [];
		for (let i = executeIndex + 1; i < entries.length; i += 1) {
			const entry = entries[i] as { type?: string; customType?: string; message?: AgentMessage } | undefined;
			if (entry?.type === "custom" && entry.customType === "plan-mode-execute") break;
			if (entry?.type === "message" && entry.message && isAssistantMessage(entry.message)
				&& entry.message.stopReason !== "aborted" && entry.message.stopReason !== "error") {
				messages.push(entry.message);
			}
		}
		this.markCompletedFromText(messages.map(getMessageText).join("\n"));
	}


	snapshot(): ExecutionProgressSnapshot {
		return { todos: this.todos.map((todo) => ({ ...todo })) };
	}

	restore(snapshot: ExecutionProgressSnapshot | undefined): void {
		if (!snapshot) return;
		this.setTodos(snapshot.todos);
	}
}
