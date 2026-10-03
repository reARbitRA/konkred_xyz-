# Merge resolution note

This branch was created to hold the conflict-resolution version of the `/fullkonk` gateway integration work.

The implementation kept the server-side BFF routing and the Vercel gateway dispatch logic intact while preserving the existing in-repo Express fallback behavior. The merge cannot be finalized from this environment because GitHub merge operations are not available from the toolset used here, but the branch is ready for the repository's normal merge flow.

Next step in GitHub:
- open the PR from this branch
- confirm the merge is conflict-free
- click Merge pull request
