# Documentation

| Document | Read it when |
|---|---|
| [INTEGRATION.md](./INTEGRATION.md) | You are adding `@7edge/auth-client` to an application — install, wiring, the three integration paths, theming, the full API and backend contract, troubleshooting. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | You are maintaining or extending the library — how the layers fit, the eight pieces of key logic and why they are the way they are, the build and scaffolding pipelines, and how to make changes safely. |
| [../STRUCTURE.md](../STRUCTURE.md) | You want a one-page map of what each folder is for. |
| [../README.md](../README.md) | Quick start, and the release/publishing process under **Maintaining**. |

## Keeping these current

These documents describe *why*, which the code cannot. When you change
behaviour, update the document that covers it in the same commit:

| You changed | Update |
|---|---|
| A public method, config option or result shape | INTEGRATION.md — [Method reference](./INTEGRATION.md#method-reference), [Configuration reference](./INTEGRATION.md#configuration-reference) |
| A route or the token bundle shape | INTEGRATION.md — [Backend contract](./INTEGRATION.md#backend-contract) |
| Refresh, storage, interceptor or cross-tab logic | ARCHITECTURE.md — the relevant **Key logic** section |
| The build, templates or scaffolding | ARCHITECTURE.md — [Scaffolding pipeline](./ARCHITECTURE.md#the-scaffolding-pipeline), [Build and packaging](./ARCHITECTURE.md#build-and-packaging) |
| A theme token, screen or primitive | INTEGRATION.md — [Theming](./INTEGRATION.md#theming); ARCHITECTURE.md — [The UI layer](./ARCHITECTURE.md#the-ui-layer) |
| Anything with a version bump | The changelog in [../README.md](../README.md) |

If you hit something these documents didn't warn you about, add it — the
[Troubleshooting](./INTEGRATION.md#troubleshooting) and
[Known limitations](./ARCHITECTURE.md#known-limitations) sections exist to
absorb exactly that.
