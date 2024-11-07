source .env

# Change the command name if you want to
COMMAND=$(cat <<EOF
{
    "name": "sneakersapi",
    "description": "Search for a product",
    "options": [
        {
            "name": "query",
            "description": "The query to search for (product name, SKU, etc.)",
            "type": 3,
            "required": true
        }
    ]
}
EOF
)

echo "Registering command..."
curl -X POST \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
    -d "$COMMAND" \
    "https://discord.com/api/v8/applications/$DISCORD_CLIENT_ID/commands"

