# Cloud

`cloud` is the closed-source control plane and web entry point for Hosted
Mobius. It is part of this monorepo rather than a separate Git repository.

## Responsibilities

The cloud service provides the web UI used by human users to:

- Sign in through `authentication`.
- View the tenants they can access.
- Create a tenant.
- Delete a tenant.
- Select a tenant and open its tenant-specific URL.

It also owns the hosted service's node inventory and tenant placement logic. When
a human creates a tenant, `cloud` selects the node that will serve it according
to cloud business rules such as location, availability, and capacity.

```text
Human
  └── Cloud Web UI
      ├── create tenant
      │   ├── select a node
      │   └── provision the tenant on services at that node
      └── select tenant
          └── redirect to the tenant URL
              └── tenant node
```

## Tenant lifecycle

### Create

When a human creates a tenant, `cloud`:

1. Verifies the human identity from `authentication`.
2. Authorizes the human to create a tenant.
3. Selects a node using cloud placement policy.
4. Creates the cloud tenant record and assigns its tenant URL.
5. Provisions the tenant independently in Mobius and the required applications
   on the selected node.
6. Shows provisioning progress and reports any service that needs to be retried.

Provisioning operations must be safe to retry because every service owns its own
tenant record and database.

### Open

When a human selects a tenant, `cloud` redirects the browser to the URL recorded
for that tenant. Requests after the redirect go directly to the tenant's node;
they do not pass through `cloud`.

### Delete

When an authorized human deletes a tenant, `cloud` starts deletion in each
service that was provisioned for the tenant. Deletion may be asynchronous, and
the UI must expose its progress and failures until it completes.

## State owned by cloud

`cloud` keeps only control-plane state needed by the hosted product:

- Known nodes and their public endpoints.
- Node metadata used by placement policy.
- Cloud tenant records and human ownership or membership.
- The node and tenant URL selected for each tenant.
- Tenant provisioning and deletion status.

This data is not a shared runtime tenant database for a node. Mobius,
`app-slack`, and every other `app-*` service still keep their own tenant records
and remain the authority for their own business state.

The fact that these services are deployed on the same node is not part of their
domain model. `cloud` coordinates their provisioning but does not combine their
databases or authorization rules.

## Request path

`cloud` is not a proxy or tenant router for normal application traffic.

```text
Tenant discovery and management:
Human ──> cloud

Tenant application traffic:
Human / Agent / Slack ──> tenant node ──> target service
```

If a request reaches a node whose target service does not contain that tenant,
the service returns `TENANT_NOT_SERVED`. It does not ask `cloud` to locate or
forward the request.

## Private deployment

The `cloud` service is specific to the hosted product and is not included in a
private deployment. A private deployment has one preconfigured tenant, so it
does not need node placement, tenant creation, tenant selection, or tenant URL
redirection.
