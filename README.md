# Moxt Platform

Moxt connects human users and agents across cloud and private environments. The
platform is built from independent services that share identity and tenant
boundaries without sharing databases or hardcoding dependencies between Mobius
and individual applications.

## Repository layout

- [`authentication`](authentication/) provides human identity.
- [`mobius`](mobius/) connects and operates agents, provides agent identity, and
  delivers system prompt contributions.
- [`apps/slack`](apps/slack/) connects tenants and agents to Slack.
- [`apps/workflow`](apps/workflow/) coordinates Tasks across humans and agents,
  with optional scheduling and proactive supervision.
- [`cloud`](cloud/) is the closed-source web and tenant control plane for the
  hosted service.
- Future `app-*` services add more web-based capabilities for agents and humans.

`authentication`, Mobius, and public applications are included as Git
submodules. `cloud` is developed directly in this monorepo because it is not an
open-source service.

## Tenants

A tenant is both a business boundary and an operational isolation boundary. It
contains multiple human users and multiple agents.

Human identities come from `authentication`. Agent identities come from Mobius.
Each application owns the authorization rules for its own operations. Identity
answers who is calling; the application decides what that caller may do inside
the tenant.

Cross-tenant access is not allowed.

## Cloud control plane

The hosted `cloud` service provides the web entry point for human users. It lets
them:

- View tenants they can access.
- Create and delete tenants.
- Select a tenant and open its tenant-specific URL.

`cloud` knows the available nodes and decides which node should serve a newly
created tenant. After a human selects a tenant, the browser is redirected to the
tenant's URL. Normal application traffic then goes directly to that node and
does not pass through `cloud`.

```text
Human ──> cloud ──> create tenant and select node
          │
          └── select tenant
                  │
                  └── redirect to tenant URL ──> assigned node
```

## Nodes

Nodes are deployed in multiple locations around the world. One node can serve
multiple tenants and can run Mobius, `app-slack`, `app-workflow`, and other
`app-*` services.

```text
Node A
├── Mobius
│   └── Mobius database: Tenant 1, Tenant 2
├── app-slack
│   └── app-slack database: Tenant 1
├── app-workflow
│   └── app-workflow database: Tenant 1, Tenant 2
└── app-xxx
    └── app-xxx database: Tenant 2
```

A node is only a deployment grouping. It does not own a shared tenant database,
and services must not depend on being deployed together. Every service keeps
its own database and independently records which tenants it serves.

Tenants normally stay on the node where they were provisioned. This supports
local access and limits a node failure to the tenants served by that node.

## Request path

There is no central tenant router in the normal request path. Clients learn the
correct endpoint during tenant or integration provisioning:

- Human browsers are redirected by `cloud` to the tenant URL.
- Mobius daemons connect directly to their assigned node.
- Agents call application URLs disclosed through their system prompt.
- Slack is configured with the `app-slack` endpoint for the tenant's node.

Each service verifies the caller and checks its own database for the tenant. If
a request reaches the wrong node, the service returns `TENANT_NOT_SERVED`. It
does not ask `cloud` to locate another node, forward the request, or migrate the
tenant.

## Identity and authorization

The platform has three common caller types:

- A human presents a signed identity credential issued by `authentication`.
- An agent presents a signed identity credential issued by Mobius.
- An external platform, such as Slack, presents proof defined by its protocol.

Receiving services verify signed human and agent credentials locally. They do
not call a central identity service for every request.

A valid credential proves identity, not permission. Each application implements
authorization for its own resources and actions. For example, `app-slack`
verifies that a request came from Slack and then separately checks whether the
human or agent represented by the Slack event may perform the requested action.

## Progressive application discovery

Applications expose web services rather than installing local agent tools or
placing complete API schemas into every agent context.

An application registers a small system prompt contribution with Mobius. The
contribution tells an agent:

- That the application service exists.
- Where the service and its detailed API documentation are located.
- That the agent should use a Mobius-issued identity token when calling it.

Mobius delivers the registered contribution as part of the agent's system
prompt. The agent decides whether the capability is relevant. Only when needed
does it read the detailed API documentation and call the service with an HTTP
client such as `curl`.

```text
Application
  └── register short prompt contribution
          │
          ▼
        Mobius ── inject into system prompt ──> Agent
                                                   │
                                                   ├── read API when needed
                                                   ├── obtain agent identity token
                                                   └── call application directly
```

This keeps the default context small while still allowing an agent to discover
and use many services.

System prompt registration is generic. Mobius stores and delivers the registered
content without knowing whether it describes Slack or another application.
Mobius does not call application APIs, contain their SDKs, or depend on any
specific `app-*` service.

The dependency points in the other direction: an application registers its
prompt contribution with Mobius, hosts its own API documentation, verifies the
Mobius-issued agent token, and performs its own authorization.

## State ownership

Every service owns its persistent and temporary state:

| Service | State owned by the service |
| --- | --- |
| `authentication` | Human identities, login providers, and sessions |
| `cloud` | Hosted nodes, tenant placement, tenant URLs, ownership, and lifecycle status |
| `mobius` | Served tenants, agents, daemon registrations, agent identity, and prompt contributions |
| `app-slack` | Served tenants, Slack installations, identity bindings, authorization, and conversation mappings |
| `app-workflow` | Served tenants, workflows, work items, schedules, execution history, and supervision state |
| `app-*` | Served tenants and application-specific business data |

There is no cross-service runtime tenant database. `cloud` may coordinate
hosted provisioning, but each service registration is independent and safe to
retry. Caches, queues, locks, event deduplication, and online presence are also
maintained by the service that uses them.

## Private deployment

A private deployment has exactly one tenant and does not include the hosted
`cloud` service. It does not offer tenant creation, tenant selection, or node
placement.

The fixed tenant is still represented in credentials, databases, and
authorization checks so that cloud and private deployments use the same service
model.

Human login may use a company's OAuth provider or Google OAuth through
`authentication`. Mobius, `app-slack`, `app-workflow`, and other applications
run against the private deployment's local services and databases.

## Proactive agentic workflows

`app-workflow` coordinates work among multiple humans and agents. A Workflow
defines stages and allowed transitions for a kind of work. Each concrete item is
a Task, which may be completed entirely by humans, assigned to an agent, or
handed between several humans and agents.

Agent participation is optional. When proactive execution is useful,
`app-workflow` adds three capabilities:

- Schedules wake a selected agent once or repeatedly, with an explicit timezone.
- Durable workflow state records the objective, current stage, responsibility,
  activity, attempts, and results.
- A Watcher periodically reviews unfinished work and can retry, reassign,
  request an update, or escalate when progress has stopped.

```text
Humans <──> app-workflow <──> Mobius <──> Agents
  │              │                           │
  │              ├── Workflows and Tasks     ├── perform Tasks
  │              └── schedules and history   └── update state
  └── perform Tasks and update state
```

`app-workflow` coordinates responsibility; humans and agents perform the work.
For example, one human may create a Task and another may complete it without an
agent. In an automated Workflow, a scheduled agent may inspect GitHub, update
code, open a pull request, or call `app-slack` to notify a human. Those actions
use capabilities and credentials available to the agent.

The workflow service does not contain direct integrations for Slack, GitHub,
email, monitoring systems, or other business platforms. It does not need to
understand the systems being observed. This keeps it independently useful with
any sufficiently capable agent and avoids coupling it to other `app-*`
services.

Like other applications, `app-workflow` registers a concise system prompt
contribution with Mobius. Agents can discover its service URL and API when they
need to read or update workflow state. Mobius remains unaware of
`app-workflow` as a specific product.

## Slack integration

`app-slack` is an independent web service that:

- Authenticates human, agent, and Slack server requests.
- Implements Slack-specific authorization within a tenant.
- Maps authenticated humans and Mobius agents to Slack identities.
- Routes Slack messages and threads to Mobius agents.
- Publishes its service and API documentation through a Mobius system prompt
  contribution.
- Accepts direct API calls from agents using Mobius-issued identity tokens.
- Allows authorized agents to read Slack context and send messages or reactions
  using their own identity.

Mobius does not need to know that `app-slack` exists. Removing or adding the
Slack application does not require a Mobius system-level change.
