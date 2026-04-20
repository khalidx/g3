This can be used as a generic dx CLI for adding and distributing platform features.

---

Alternatively, download the git-externals for your platform from the releases page, and place it in your `PATH`, with the binary name set to `git-externals`.

---

Now, you can run:

- `git g3`
- `git g3 version`
- `git externals`

The scripts are also individually available in your `PATH`, like `git-g3`.

---

Support for non github urls

---

# Add this to your ~/.bash_profile (or whatever profile file you use)
export PATH="$(pwd)/g3/bin:$PATH"

---

automated install (binaries, don't require bun or node)

add ability to automatically update (should update automatically to latest version if enough time elapsed from last run it should check)
or should just tell user to update

---

new pipeline

keep making PRs

can deploy to any lower env from any passed pr build (artifact by sha) (by pr # or ref)
can deploy to prod from any merged pr build (by "main" or previous deployment by sha, or triggers full deploy for any previous main without a sha)
automatically tagged
    env/<name>
    stable/<version>
