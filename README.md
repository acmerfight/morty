# Monorepo

This repository contains the services and integrations that make up the platform.

## Overview

A human user starts by registering through the [`authentication`](authentication/)
service. After registration, the user can create and delete tenants.

A tenant is an isolated environment with its own Mobius deployment and a set of
cloud applications. The user deploys the Mobius daemon on a machine they control
and registers that daemon with the tenant. The daemon then provides the tenant's
Mobius runtime and connects it to the platform's cloud applications.

```text
Human user
    │
    └── registers through authentication
            │
            └── manages tenants
                    │
                    ├── dedicated Mobius daemon
                    │       └── deployed and registered by the user
                    │
                    └── cloud apps
```

## Core concepts

### Human users

Human users authenticate through the authentication service and manage the
tenants they own. They can create new tenants and delete existing tenants.

### Tenants

A tenant is the isolation and ownership boundary for a user's setup. Each tenant
has its own Mobius and can contain multiple cloud applications.

### Mobius

Each tenant has a dedicated Mobius runtime. The user deploys the Mobius daemon
to their own machine and registers it with the corresponding tenant. This keeps
the tenant's Mobius instance associated with the tenant while allowing the user
to control where the daemon runs.

### Cloud applications

Cloud applications extend a tenant with integrations and capabilities. The first
application provided by this platform is [`app-slack`](apps/slack/).

`app-slack` integrates a tenant with Slack in two directions:

- Human users can send messages to an agent from Slack.
- The agent receives a tool that allows it to proactively send messages to Slack
  using its own identity.

This makes Slack both an interface for users to communicate with agents and a
channel through which agents can act independently.
