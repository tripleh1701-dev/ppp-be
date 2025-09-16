#!/bin/bash

# Git askpass script that reads credentials from .env.local
# This script ensures we only use the configured user credentials

ENV_FILE="$(dirname "$0")/../.env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env.local file not found" >&2
    exit 1
fi

# Source the environment file
source "$ENV_FILE"

# Check if we have the required variables
if [ -z "$GIT_USERNAME" ] || [ -z "$GIT_PAT" ]; then
    echo "Error: GIT_USERNAME or GIT_PAT not set in .env.local" >&2
    exit 1
fi

# Determine what type of credential is being requested
if [[ "$1" == *"Username"* ]]; then
    echo "$GIT_USERNAME"
elif [[ "$1" == *"Password"* ]] || [[ "$1" == *"password"* ]]; then
    echo "$GIT_PAT"
else
    # Default to PAT for most cases
    echo "$GIT_PAT"
fi
