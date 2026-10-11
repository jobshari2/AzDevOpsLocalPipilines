# Local Azure Pipelines Runner

| Folder | What it is |
| --- | --- |
| [`local-azure-pipelines-runner-design.md`](local-azure-pipelines-runner-design.md) | The analysis and design |
| [`azp-local/`](azp-local) | The tool: core library, local Docker engine, `azp-local` command line and the VS Code extension |
| [`demo-app/`](demo-app) | A sample React frontend with an `azure-pipelines.yml`, used to try the tool |

The two are independent. `demo-app` is an ordinary application with an ordinary pipeline; `azp-local` is generic and contains nothing about it. The only link is that the tool's tests use the demo's pipeline as the first entry of their corpus.

To build, install and try it, follow [`SETUP.md`](SETUP.md). For what is built and what is not, see [`azp-local/README.md`](azp-local/README.md).
