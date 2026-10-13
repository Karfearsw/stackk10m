# OceanLuxe CRM MCP Server

Lets AI agents (Telnyx Jordan, Claude, etc.) search leads, look up contacts,
update notes, and create tasks — directly in the CRM.

## Tools

| Tool | What it does |
|---|---|
| `search_leads` | Find leads by name, phone, address |
| `get_lead` | Full lead details by ID |
| `update_lead_notes` | Append AI notes to a lead |
| `search_contacts` | Find buyers/contacts |
| `create_task` | Create follow-up tasks |
| `get_lead_calls` | Recent call history + dispositions |

## Running

```bash
# stdio (Claude Desktop, CLI agents)
CRM_API_KEY=lxrm_... npm start

# SSE (Telnyx AI assistants, web clients)
CRM_API_KEY=lxrm_... PORT=3100 npm run start:sse
```

## Connecting to Telnyx AI Assistant

1. Deploy this server somewhere reachable (VPS, Railway, etc.)
2. In Telnyx portal → AI Assistants → High-Intent Lead Screener → Tools
3. Add MCP server: `https://your-server/sse`
4. Jordan can now call CRM tools mid-conversation:
   - "Let me pull up your property details..." → `get_lead`
   - "I'll have someone follow up..." → `create_task`

## Connecting to Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "oceanluxe-crm": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "CRM_API_KEY": "lxrm_...",
        "CRM_BASE_URL": "https://crm.oceanluxe.org"
      }
    }
  }
}
```

## Auth

Uses a CRM API key (`Bearer lxrm_...`). Create one in CRM → Settings → API Keys.
The key needs lead read/write + task create permissions.
