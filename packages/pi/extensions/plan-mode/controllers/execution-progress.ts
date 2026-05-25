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

	readTodosFromPlan(cwd: string, planPath: string): TodoItem[] {
		try {
			return extractTodoItems(readFileSync(resolve(cwd, planPath), "utf8"));
		} catch {
			return [];
		}
	}

	loadTodosFromPlan(cwd: string, planPath: string): TodoItem[] {
		this.setTodos(this.readTodosFromPlan(cwd, planPath));
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

	completedCount(): number {
		return this.todos.filter((todo) => todo.completed).length;
	}

	isComplete(): boolean {
		return this.todos.length > 0 && this.todos.every((todo) => todo.completed);
	}

	replayCompletedFromSessionEntries(entries: readonly unknown[]): void {
		let executeIndex = -1;
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const entry = entries[i] as { customType?: string };
			if (entry.customType === "plan-mode-execute") {
				executeIndex = i;
				break;
			}
		}

		const messages: AgentMessage[] = [];
		for (let i = executeIndex + 1; i < entries.length; i += 1) {
			const entry = entries[i] as {
				type?: string;
				message?: AgentMessage;
			};
			if (entry?.type === "message" && entry.message && isAssistantMessage(entry.message)) {
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
