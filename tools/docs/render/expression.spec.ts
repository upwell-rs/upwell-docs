import { describe, expect, it } from 'vitest';

import { testIndex, type TestEntry } from '../fixtures.ts';
import { resolveExpressions, resolveMembers } from './expression.ts';
import { readScope } from './resolve.ts';

/**
 * A framework shaped like the real one where it matters: a type with a builder, a builder whose
 * setters return `Self`, an async method returning a `Result`, and a config type reached through
 * `default()`.
 */
const FRAMEWORK: readonly TestEntry[] = [
	{ canonical: 'upwell_app::app::App', reachableAt: ['upwell::App', 'upwell::prelude::App'] },
	{ canonical: 'upwell_app::app::AppBuilder', reachableAt: ['upwell::AppBuilder'] },
	{ canonical: 'upwell_axum::config::AxumConfig', reachableAt: ['upwell::axum::AxumConfig'] },
	{
		canonical: 'upwell_app::app::App::builder',
		overrides: { kind: 'assoc_fn', returns: 'AppBuilder<D>', signature: 'pub fn builder() -> AppBuilder<D>' }
	},
	{
		canonical: 'upwell_app::app::App::serve',
		overrides: { kind: 'method', returns: 'Result<(), Error>', signature: 'pub async fn serve(&self) -> Result<(), Error>' }
	},
	{
		canonical: 'upwell_app::app::AppBuilder::name',
		overrides: { kind: 'method', returns: 'Self', signature: 'pub fn name(self, name: &str) -> Self' }
	},
	{
		canonical: 'upwell_app::app::AppBuilder::build',
		overrides: { kind: 'method', returns: 'App<D>', signature: 'pub fn build(self) -> App<D>' }
	},
	{
		canonical: 'upwell_axum::config::AxumConfig::port',
		overrides: { kind: 'struct_field', signature: 'port: u16' }
	},
	{
		canonical: 'upwell_di::descriptors::Component',
		reachableAt: ['upwell::prelude::Component'],
		overrides: { kind: 'trait' }
	},
	{
		canonical: 'upwell_di::descriptors::Component::configure',
		overrides: { kind: 'method', returns: 'Self', signature: 'fn configure(&self) -> Self' }
	},
	{
		canonical: 'upwell_di::descriptors::Component::SCOPE',
		overrides: { kind: 'assoc_const', signature: 'const SCOPE: Scope' }
	},
	{
		canonical: 'upwell_di::descriptors::Component::Output',
		overrides: { kind: 'assoc_type', signature: 'type Output' }
	},
	{ canonical: 'upwell_di::scope::Scope', reachableAt: ['upwell::Scope'] }
];

const index = testIndex(FRAMEWORK);

/** The same framework plus a type whose field is worth destructuring. */
const withHolder = testIndex([
	...FRAMEWORK,
	{ canonical: 'upwell_app::Holder', reachableAt: ['upwell::Holder'] },
	{
		canonical: 'upwell_app::Holder::config',
		overrides: { kind: 'struct_field', signature: 'config: AxumConfig', returns: 'AxumConfig' }
	}
]);

/** Resolves a snippet and reports which member each identifier landed on, by written name. */
function members(code: string, imports = 'use upwell::prelude::*;\n'): Record<string, string> {
	const source = `${imports}${code}`;
	const resolved = resolveMembers(source, readScope(source), index);
	const found: Record<string, string> = {};

	for (const [offset, token] of resolved) {
		found[source.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/)![0]] = token.symbol.path;
	}

	return found;
}

describe('resolveMembers', () => {
	it('resolves an associated function called on a type', () => {
		expect(members('let b = App::builder();')).toMatchObject({ builder: 'upwell_app::app::App::builder' });
	});

	it('resolves a method on a binding whose type was annotated', () => {
		expect(members('fn run(app: App) { app.serve(); }')).toMatchObject({ serve: 'upwell_app::app::App::serve' });
	});

	it('resolves a chain through the return type of each call', () => {
		// `builder()` returns AppBuilder, `name()` returns Self, so `build()` is still on AppBuilder.
		expect(members('let app = App::builder().name("demo").build();')).toMatchObject({
			builder: 'upwell_app::app::App::builder',
			name: 'upwell_app::app::AppBuilder::name',
			build: 'upwell_app::app::AppBuilder::build'
		});
	});

	it('carries an inferred type from a let binding to a later statement', () => {
		expect(members('let app = App::builder().build();\napp.serve();')).toMatchObject({
			serve: 'upwell_app::app::App::serve'
		});
	});

	it('reads through await, because the recorded return type is already the awaited one', () => {
		expect(members('fn run(app: App) { app.serve().await; }')).toMatchObject({
			serve: 'upwell_app::app::App::serve'
		});
	});

	it('resolves a struct field', () => {
		expect(members('fn read(config: AxumConfig) { config.port; }')).toMatchObject({
			port: 'upwell_axum::config::AxumConfig::port'
		});
	});

	it('keeps the chain alive through the default() convention', () => {
		// `AxumConfig::default` comes from a trait impl, whose members the index does not carry — but
		// the convention is reliable enough that `.port` after it still resolves.
		expect(members('let config = AxumConfig::default();\nconfig.port;')).toMatchObject({
			port: 'upwell_axum::config::AxumConfig::port'
		});
	});

	it('resolves a member written on a fully qualified path', () => {
		expect(members('let b = upwell::App::builder();', '')).toMatchObject({
			builder: 'upwell_app::app::App::builder'
		});
	});

	it('resolves nothing for a method on a receiver of unknown type', () => {
		expect(members('fn run(thing: Unknown) { thing.serve(); }')).toEqual({});
	});

	it('resolves nothing for a name that is not a member of the receiver', () => {
		expect(members('fn run(app: App) { app.nonexistent(); }')).toEqual({});
	});

	it('does not carry a type past a call it could not resolve', () => {
		// `mystery()` is unknown, so what it returns is unknown, and `serve` after it must not be
		// attributed to `App` merely because `App` was the last type seen.
		expect(members('fn run(app: App) { app.mystery().serve(); }')).toEqual({});
	});

	it('does not treat a nested argument as a continuation of the outer chain', () => {
		expect(members('fn run(app: App) { log(App::builder()); app.serve(); }')).toMatchObject({
			builder: 'upwell_app::app::App::builder',
			serve: 'upwell_app::app::App::serve'
		});
	});

	it('ignores a member named inside a string', () => {
		expect(members('fn run(app: App) { let note = "app.serve() is the entry point"; }')).toEqual({});
	});

	it('ignores a member named inside a comment', () => {
		expect(members('fn run(app: App) {\n    // call app.serve() to start\n}')).toEqual({});
	});

	it('distinguishes two receivers that share a member name', () => {
		const source = 'use upwell::prelude::*;\nfn run(app: App, b: AppBuilder) { app.serve(); b.build(); }';
		const resolved = resolveMembers(source, readScope(source), index);
		const paths = [...resolved.values()].map((token) => token.symbol.path);

		expect(paths).toEqual(['upwell_app::app::App::serve', 'upwell_app::app::AppBuilder::build']);
	});

	describe('associated items', () => {
		it('resolves an associated constant written on the trait', () => {
			expect(members('let scope = Component::SCOPE;')).toMatchObject({
				SCOPE: 'upwell_di::descriptors::Component::SCOPE'
			});
		});

		it('resolves an associated type written on the trait', () => {
			expect(members('fn take(value: Component::Output) {}')).toMatchObject({
				Output: 'upwell_di::descriptors::Component::Output'
			});
		});

		it('resolves an associated constant through the type that owns it', () => {
			expect(members('fn read(config: AxumConfig) { AxumConfig::port; }')).toMatchObject({
				port: 'upwell_axum::config::AxumConfig::port'
			});
		});
	});

	describe('generics', () => {
		it('resolves a method on a receiver bounded by a framework trait', () => {
			expect(members('fn register<C: Component>(item: C) { item.configure(); }')).toMatchObject({
				configure: 'upwell_di::descriptors::Component::configure'
			});
		});

		it('resolves a method on a receiver bounded in a where clause', () => {
			expect(members('fn register<C>(item: C) where C: Component { item.configure(); }')).toMatchObject({
				configure: 'upwell_di::descriptors::Component::configure'
			});
		});

		it('reads through the generic arguments of a returned type', () => {
			// `build()` returns `Result<App<D>, …>`; both the Result and the type parameter have to be
			// seen past for `serve` to be found on `App`.
			expect(members('let app = App::builder().build();\napp.serve();')).toMatchObject({
				serve: 'upwell_app::app::App::serve'
			});
		});

		it('carries the chain through a turbofish', () => {
			// `::<T>` is punctuation inside a call. Read as a comparison it ends the expression, and
			// every member after it is lost — which is most of a builder chain in real documentation.
			expect(members('let app = App::builder().name::<String>("demo").build();')).toMatchObject({
				build: 'upwell_app::app::AppBuilder::build'
			});
		});

		it('carries the chain through a nested turbofish', () => {
			expect(members('let app = App::builder().name::<Vec<String>>("demo").build();')).toMatchObject({
				build: 'upwell_app::app::AppBuilder::build'
			});
		});

		it('does not bind a parameter whose bound is not a framework trait', () => {
			expect(members('fn register<C: Clone>(item: C) { item.configure(); }')).toEqual({});
		});

		it('does not mistake a struct literal field for a generic bound', () => {
			// `Scope: Component` is a field named `Scope`, not a bound — and `Scope` is a struct here.
			expect(members('fn make(item: Config) { item.configure(); }')).toEqual({});
		});
	});

	it('keys results by offset, so one name written twice resolves independently', () => {
		const source = 'use upwell::prelude::*;\nfn run(app: App, other: Unknown) { app.serve(); other.serve(); }';
		const resolved = resolveMembers(source, readScope(source), index);

		expect(resolved.size).toBe(1);
	});

	describe('destructuring', () => {
		/** A framework shaped for destructuring: a pair-returning method and a struct with fields. */
		const patterns = testIndex([
			...FRAMEWORK,
			{
				canonical: 'upwell_app::app::App::split',
				overrides: { kind: 'method', returns: '(AxumConfig, App<D>)', signature: 'pub fn split(self) -> (AxumConfig, App<D>)' }
			}
		]);

		function locals(code: string, index = patterns): Record<string, string> {
			const source = `use upwell::prelude::*;\n${code}`;
			const { variables } = resolveExpressions(source, readScope(source), index);

			return Object.fromEntries([...variables.values()].map((entry) => [entry.name, entry.path]));
		}

		it('types each name in a tuple pattern by its position', () => {
			expect(locals('fn run(app: App) {\n    let (cfg, next) = app.split();\n}')).toMatchObject({
				cfg: 'upwell_axum::config::AxumConfig',
				next: 'upwell_app::app::App'
			});
		});

		it('lets a member resolve through a name a tuple pattern bound', () => {
			const source = 'use upwell::prelude::*;\nfn run(app: App) {\n    let (cfg, _) = app.split();\n    cfg.port;\n}';
			const { members } = resolveExpressions(source, readScope(source), patterns);

			expect([...members.values()].map((entry) => entry.symbol.path)).toContain(
				'upwell_axum::config::AxumConfig::port'
			);
		});

		it('types a name a struct pattern binds from the field it destructures', () => {
			// The name is typed for everything after the pattern; at the pattern itself it is the field,
			// which is the more specific thing to say about that particular token.
			expect(
				locals('fn run(holder: Holder) {\n    let Holder { config } = holder;\n    config.port;\n}', withHolder)
			).toMatchObject({ config: 'upwell_axum::config::AxumConfig' });
		});

		it('annotates the field a struct pattern names, not just the binding', () => {
			const source = 'use upwell::prelude::*;\nfn run(holder: Holder) {\n    let Holder { config } = holder;\n}';
			const { members } = resolveExpressions(source, readScope(source), withHolder);

			// Destructuring is how a reader most often meets a config type's fields, so the field's own
			// documentation has to be reachable there.
			expect([...members.values()].map((entry) => entry.symbol.path)).toContain('upwell_app::Holder::config');
		});

		it('follows a rename, binding the new name rather than the field', () => {
			const found = locals(
				'fn run(holder: Holder) {\n    let Holder { config: settings } = holder;\n    settings.port;\n}',
				withHolder
			);

			expect(found).toMatchObject({ settings: 'upwell_axum::config::AxumConfig' });
			expect(found).not.toHaveProperty('config');
		});

		it('types a destructuring parameter, which is how an extractor is written', () => {
			expect(locals('fn handle(Holder { config }: Holder) {\n    config.port;\n}', withHolder)).toMatchObject({
				config: 'upwell_axum::config::AxumConfig'
			});
		});

		it('does not read a call as a pattern', () => {
			// `log(App::builder())` has the shape of `Json(payload)` — a capitalised path and an open
			// bracket. Only the annotation that follows a real pattern separates them.
			const source = 'use upwell::prelude::*;\nfn run(app: App) { log(App::builder()); }';
			const { members } = resolveExpressions(source, readScope(source), patterns);

			expect([...members.values()].map((entry) => entry.symbol.path)).toContain('upwell_app::app::App::builder');
		});

		it('binds nothing when the initialiser is not a tuple', () => {
			expect(locals('fn run(app: App) {\n    let (a, b) = app.serve();\n}')).toEqual({ app: 'upwell_app::app::App' });
		});
	});

	describe('typed locals', () => {
		/** Every occurrence of a typed local, as `name: Type`. */
		function locals(code: string): string[] {
			const source = `use upwell::prelude::*;\n${code}`;
			const { variables } = resolveExpressions(source, readScope(source), index);

			return [...variables.values()].map((entry) => `${entry.name}: ${entry.path}`);
		}

		it('annotates a local declared by annotation', () => {
			expect(locals('fn run(app: App) { app.serve(); }')).toEqual([
				'app: upwell_app::app::App',
				'app: upwell_app::app::App'
			]);
		});

		it('annotates a local whose type came from its initialiser', () => {
			// The declaration is annotated too, which needs the second pass: at `let app` the type is
			// not known yet, because the call producing it has not been read.
			expect(locals('let app = App::builder().build();\napp.serve();')).toEqual([
				'app: upwell_app::app::App',
				'app: upwell_app::app::App'
			]);
		});

		it('annotates a local bound through a generic trait bound', () => {
			expect(locals('fn go<C: Component>(item: C) { item.configure(); }')).toEqual([
				'item: upwell_di::descriptors::Component',
				'item: upwell_di::descriptors::Component'
			]);
		});

		it('does not annotate a local whose type is unknown', () => {
			expect(locals('fn run(thing: Unknown) { thing.serve(); }')).toEqual([]);
		});

		it('does not annotate a member that happens to share a local name', () => {
			// `App::name` is a method; the `name` in `app.name()` is that member, not the local.
			const found = locals('fn run(name: App) { name.serve(); }');

			expect(found).toEqual(['name: upwell_app::app::App', 'name: upwell_app::app::App']);
		});

		it('does not annotate a generic parameter, which is a type rather than a value', () => {
			expect(locals('fn go<C: Component>(item: C) { item.configure(); }')).not.toContain(
				'C: upwell_di::descriptors::Component'
			);
		});

		it('does not annotate anything when no local has a known type', () => {
			expect(locals('let thing = Unknown::make();')).toEqual([]);
		});
	});
});
