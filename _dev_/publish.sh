#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✔${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✖${NC} $1"
}

# Variables to track state for rollback
ORIGINAL_VERSION=""
NEW_VERSION=""
CHANGES_COMMITTED=false
CHANGES_PUSHED=false
TAG_CREATED=false
TAG_PUSHED=false

# Function to rollback changes
rollback() {
    log_warning "Rolling back changes..."
    
    if [ -n "$ORIGINAL_VERSION" ] && [ -n "$NEW_VERSION" ]; then
        # Reset version in package.json
        if [ -f "package.json" ]; then
            sed -i.bak "s/\"version\": \"$NEW_VERSION\"/\"version\": \"$ORIGINAL_VERSION\"/" package.json
            rm -f package.json.bak
        fi
        
        # Reset git if changes were committed (restore original commit before amend)
        if [ "$CHANGES_COMMITTED" = true ]; then
            # Since we amended the commit, we need to restore the original
            # Using reflog to get back to the commit before the amend
            git reset --hard HEAD@{1} 2>/dev/null || true
            
            # If we pushed the amended commit, we need to force push the original back
            if [ "$CHANGES_PUSHED" = true ]; then
                log_warning "Force pushing to restore original commit..."
                git push --force-with-lease origin main 2>/dev/null || true
            fi
        fi
        
        # Delete local tag if created
        if [ "$TAG_CREATED" = true ]; then
            git tag -d "v$NEW_VERSION" 2>/dev/null || true
        fi
        
        # Delete remote tag if pushed
        if [ "$TAG_PUSHED" = true ]; then
            git push origin ":refs/tags/v$NEW_VERSION" 2>/dev/null || true
        fi
        
        log_success "Rollback completed"
    fi
}

# Error handler
handle_error() {
    log_error "Publishing failed: $1"
    
    if [ -n "$ORIGINAL_VERSION" ] && [ -n "$NEW_VERSION" ]; then
        read -p "Do you want to rollback changes? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rollback
        fi
    fi
    
    exit 1
}

# Trap errors
trap 'handle_error "Unexpected error occurred"' ERR

echo -e "${BLUE}🚀 Langsys JS Svelte Publishing Script${NC}\n"

# Check prerequisites
log_info "Checking prerequisites..."

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    handle_error "GitHub CLI (gh) is not installed. Please install it from: https://cli.github.com/"
fi
log_success "GitHub CLI is installed"

# Check if gh CLI is authenticated
if ! gh auth status &> /dev/null; then
    log_warning "GitHub CLI is not authenticated"
    echo "The GitHub CLI needs to be authenticated to create releases."
    echo "This is a one-time setup that will be saved for future use."
    echo
    read -p "Would you like to authenticate now? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        log_info "Starting GitHub authentication..."
        if ! gh auth login; then
            handle_error "GitHub authentication failed"
        fi
        log_success "GitHub authentication completed"
    else
        handle_error "GitHub authentication is required to create releases"
    fi
else
    log_success "GitHub CLI is authenticated"
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    handle_error "Not in a git repository"
fi

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    handle_error "You must be on the main branch to publish. Current branch: $CURRENT_BRANCH"
fi

# Check for unpushed commits
UNPUSHED_COMMITS=$(git rev-list origin/main..HEAD --count)
if [ "$UNPUSHED_COMMITS" = "0" ]; then
    handle_error "No unpushed commits found. Please make your changes and commit them before publishing."
fi
log_success "Found $UNPUSHED_COMMITS unpushed commit(s)"

# Fetch latest from remote
git fetch > /dev/null 2>&1

log_success "All prerequisites met"

# Get current version
ORIGINAL_VERSION=$(node -p "require('./package.json').version")
log_info "Current version: $ORIGINAL_VERSION"

# Calculate suggested version (increment patch version)
SUGGESTED_VERSION=$(echo "$ORIGINAL_VERSION" | awk -F. '{$NF = $NF + 1;} 1' | sed 's/ /./g')

# Prompt for new version
read -p "Enter new version (suggested: $SUGGESTED_VERSION): " NEW_VERSION
if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION=$SUGGESTED_VERSION
fi

# Validate version format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
    handle_error "Invalid version format. Expected format: x.y.z or x.y.z-tag"
fi

# Check if version already exists as a tag
if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
    handle_error "Version v$NEW_VERSION already exists as a tag"
fi

# Confirm before proceeding
echo
read -p "Ready to publish version $NEW_VERSION? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Publishing cancelled"
    exit 0
fi

echo

# Update version in package.json
log_info "Updating version in package.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"$ORIGINAL_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
else
    # Linux
    sed -i "s/\"version\": \"$ORIGINAL_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi
log_success "Updated package.json version to $NEW_VERSION"

# Run npm install to update package-lock.json
log_info "Running npm install to update package-lock.json..."
npm install

# Run build to ensure everything compiles
log_info "Running build to verify everything compiles..."
npm run build

# Amend the last commit with version bump
log_info "Amending last commit with version bump..."
git add package.json package-lock.json

# Get the current commit message
LAST_COMMIT_MESSAGE=$(git log -1 --pretty=%B)
AMENDED_MESSAGE="$LAST_COMMIT_MESSAGE

[Version bumped to $NEW_VERSION]"

# Amend the commit
echo "$AMENDED_MESSAGE" | git commit --amend -F -
CHANGES_COMMITTED=true

# Push to origin (with force since we amended)
log_info "Pushing to origin..."
git push --force-with-lease origin main
CHANGES_PUSHED=true

# Create and push tag
log_info "Creating and pushing tag..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
TAG_CREATED=true
git push origin "v$NEW_VERSION"
TAG_PUSHED=true

# Create GitHub release
log_info "Creating GitHub release..."

# Get commit messages since last release
COMMIT_MESSAGES=""
if git rev-parse "v$ORIGINAL_VERSION" >/dev/null 2>&1; then
    # Get commits since last version tag
    COMMITS=$(git log --oneline "v$ORIGINAL_VERSION"..HEAD --reverse)
else
    # If no previous version tag, get all commits
    COMMITS=$(git log --oneline --reverse)
fi

# Format commit messages for release notes
if [ -n "$COMMITS" ]; then
    COMMIT_MESSAGES="

## Changes in this release

"
    while IFS= read -r commit; do
        if [ -n "$commit" ]; then
            COMMIT_HASH=$(echo "$commit" | cut -d' ' -f1)
            COMMIT_MSG=$(echo "$commit" | cut -d' ' -f2-)
            # Get the full commit message (including body) for better formatting
            FULL_COMMIT_MSG=$(git log --format=%B -n 1 "$COMMIT_HASH")
            COMMIT_MESSAGES="$COMMIT_MESSAGES- [\`$COMMIT_HASH\`](https://github.com/langsys/langsys-js-svelte/commit/$COMMIT_HASH)  
  $FULL_COMMIT_MSG

"
        fi
    done <<< "$COMMITS"
fi

RELEASE_NOTES="Release v$NEW_VERSION

This release includes all changes since the previous version.

## Installation

\`\`\`bash
npm install langsys-js-svelte@$NEW_VERSION
\`\`\`$COMMIT_MESSAGES

## Full Changelog

See the [commit history](https://github.com/langsys/langsys-js-svelte/compare/v$ORIGINAL_VERSION...v$NEW_VERSION) for a complete diff of all changes."

gh release create "v$NEW_VERSION" \
    --title "v$NEW_VERSION" \
    --notes "$RELEASE_NOTES"

# Publish to npm
log_info "Publishing to npm..."
npm publish

echo
log_success "🎉 Successfully published version $NEW_VERSION!"
log_success "View the release at: https://github.com/langsys/langsys-js-svelte/releases/tag/v$NEW_VERSION"
log_success "View on npm at: https://www.npmjs.com/package/langsys-js-svelte/v/$NEW_VERSION"