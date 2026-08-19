import { createContext } from 'svelte';

export interface NavigationTreeState {
	current(): string;
	activeGroups(): ReadonlySet<string>;
	truncate(): boolean;
	isOpen(id: string, fallback: boolean): boolean;
	onToggle(id: string, open: boolean): void;
}

export const [getNavigationTreeState, setNavigationTreeState] = createContext<NavigationTreeState>();
