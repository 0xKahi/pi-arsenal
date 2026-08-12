---
description: Assign your p2p council member roles
---

run `p2p_ls` to view all available council members.  

**NOTE:** Each member is an independent agent: they share no memory or conversation history — p2p_council only passes messages and prompts between them.
Anything a remote agent needs — file paths, task state, expected output, where to send its callback — must be in the message itself.

## Quick Tool Reference 

| tools    | summary                                                                                |
|----------|----------------------------------------------------------------------------------------|
| p2p_ls   | returns connected terminals/agents with names, live status, cwd, description(optional) |
| p2p_ask  | run synchronous question/task to one or multiple agents and wait for their response    |
| p2p_send | fire-and-forget message to another connected p2p-council agent                         |


**Selection Guide:**
- Need the answer back now? → `p2p_ask`
- Need to batch synchronous tasks across multiple agents? -> `p2p_ask`
- Need autonomous work done? → `p2p_send(triggerTurn: true)`
- Need to notify/reply only? → `p2p_send(triggerTurn: false)`

**Guardrails:**
- callback convention for `p2p_send(triggerTurn: true)` you do not get an automatic response, so ask the receiver to report back when done.
- after `p2p_send(triggerTurn: true)` to agent X, do not `p2p_ask` X until X sends a completion callback. or until `p2p_ls` shows X is idle again 
- when assigning tasks to agents be specific about the task, do not assign the same task to multiple agents in the same `cwd` 
  to avoid duplicate work, file edits etc. 

**Tips:**
- you can parallelize synchronous tasks by using `p2p_ask` with multiple agents at once, allowing for faster execution.
- for members with the same domain and role, you can split tasks between them to increase efficiency and reduce workload on a single agent. example fix 4 files -> agent1 fixes 2 files, agent2 fixes 2 files.

## Defining Agent Identity 

each agent has a should have a unique identity and purpose form the `p2p_ls` tool

- **name**: the unique identifier of the agent
- **cwd**: the current working directory of the agent this marks the agents domain and the files it can access.
agents with the same cwd as you means they share the same domain and can execute tasks within that domain.
- **description**: this is an optional field that can be included in `p2p_ls` and it provides the description
of the agents domain and what they have access to. some agents might have the same description but different cwd. 
which could mean that they are in different worktrees/workspaces


## Workflow 

### Assigning Roles

after running the `p2p_ls` tool list out all your available council members dont include yourself always return as a numbered list
and ask the user to assign a role to each member

**Return Format:**
```
What roles would you like to assign to the following council members?
1. <agent_name>
2. <agent_name>
...
```

**note:** user does not have to assign every agent a role

the `roles` assigned to each agent along with their `cwd` and `description` should determine how you will use each agent 
for now an all future tasks until the user reassign their roles or the agent leaves the council.

**Example:**
- user assigns the role of "fixer: an agent to do quick fixes and code fixes" to 3 agents with the same cwd.
  this means you should use these 3 agents to do quick fixes and code fixes in that domain.
- user assigns the role of "explorer: an agent to explore and find new information" to an agents with same cwd.
  this means you should use these 2 agents to explore and find new information in the current cwd.
- user assigns the role of "reference: agent has acces to X use it to get information about Y" to an agent with a different cwd.
  this means you should get this agent to get information about Y from X in that domain.




