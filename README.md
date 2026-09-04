# Moxt Platform

This monorepo brings together the services and applications that form the Moxt
platform.

## Tenants and identities

A tenant is both a business boundary and an operational isolation boundary. A
tenant contains multiple human users and multiple agents.

- Human identities are provided by [`authentication`](authentication/).
- Agent identities are provided by [`mobius`](mobius/).
- Each application owns the authorization rules for its own business actions.

Authentication answers "who is this human?" Mobius answers "which agent is
calling?" An application such as `app-slack` decides what that human or agent is
allowed to do.

## Deployment model

We deploy nodes in multiple locations around the world. A node runs Mobius and a
set of applications, such as [`app-slack`](apps/slack/) and future `app-*`
services. One node can serve multiple tenants.

Tenants normally remain on the node where they were provisioned. This provides
local access and limits the impact of a node failure to the tenants served by
that node.

```text
Node A
├── Mobius
│   └── Mobius database: Tenant 1, Tenant 2
├── app-slack
│   └── app-slack database: Tenant 1
└── app-xxx
    └── app-xxx database: Tenant 2
```

A node is only a deployment grouping. It is not a business entity and does not
own a shared list of tenants. Every service keeps its own database and decides
independently which tenants it serves. Services must not depend on being
deployed together on the same node.

## Request routing

There is no central tenant router in the request path and no central database
that maps every tenant to a node.

Clients learn the correct service endpoint when a tenant or integration is
provisioned:

- Human clients use the endpoint assigned to their tenant.
- A Mobius daemon registers with and reconnects directly to its assigned node.
- Agent tools call the application endpoint configured for their tenant.
- A Slack installation is configured with the `app-slack` endpoint on its node.

Each service verifies the caller's credential and then checks its own database
for the tenant. If the request reaches the wrong node, the service reports that
it does not serve the tenant. It does not look up another node or forward the
request.

```text
Request
  └── assigned node
      └── target service
          ├── tenant exists: authenticate, authorize, and handle
          └── tenant missing: TENANT_NOT_SERVED
```

## Credentials and authorization

The platform accepts three main kinds of callers:

- A human presents a credential issued by `authentication`.
- An agent presents a credential issued by Mobius.
- Slack sends a signed request that is verified by `app-slack`.

Signed human and agent credentials can be verified locally by the receiving
service. Normal requests do not need to call a central authentication service.

A valid credential proves identity, not permission. After identifying the
caller, each application applies its own tenant-scoped authorization rules.

For Slack events, `app-slack` first verifies that the request came from Slack and
then separately checks whether the Slack user or bot in the event may perform
the requested action.

## State ownership

Every service owns its persistent and temporary state:

| Service | Persistent state |
| --- | --- |
| `authentication` | Human identities, login providers, and human sessions |
| `mobius` | Served tenants, agents, daemon registrations, and agent identity data |
| `app-slack` | Served tenants, Slack installations, identity bindings, permissions, and conversation mappings |
| `app-*` | Its own tenants and application-specific business data |

Temporary state such as caches, pending messages, event deduplication, locks,
and online presence is also maintained independently by the service that uses
it.

There is no cross-service tenant database. Provisioning may register a tenant
with several services, but each registration is independent and retryable.

## Cloud service

The cloud service runs multiple nodes in different locations. Each node serves a
stable group of tenants, while every service on that node uses and owns its own
database.

The design provides:

- Local access through geographically distributed nodes.
- Failure isolation between nodes.
- Independent scaling of each node and service.
- No central runtime dependency for tenant request routing.

## Private deployment

A private deployment has exactly one tenant and does not expose multi-tenant
creation or selection.

The single tenant is still represented in credentials, databases, and
authorization checks so that cloud and private deployments use the same service
model.

Human login can be connected to a company's OAuth provider or to Google OAuth.
`authentication` converts that external login into the same human identity used
across the platform. Mobius, `app-slack`, and other applications run against the
private deployment's local databases and services.

## Slack integration

[`app-slack`](apps/slack/) connects a tenant to Slack. It:

- Verifies requests from humans, agents, and Slack servers.
- Implements Slack-specific authorization.
- Maps authenticated humans to Slack users.
- Maps Mobius agents to Slack-facing identities.
- Routes Slack messages and threads to Mobius.
- Allows agents to read permitted Slack context.
- Allows agents to send messages and reactions using their own identity.
