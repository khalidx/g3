# g3

A collection of plugins for git.

## Setup

Download a binary from the releases page and put it on your `$PATH`.

Run the following commands in a `bash`-like terminal.

```bash
git clone https://github.com/khalidx/g3.git
```

Make sure to add this to your `~/.bash_profile` (or whatever profile file you use):

```bash
export PATH="$(pwd)/g3/bin:$PATH"
```

## Plugins

### Externals

The `externals` command brings SVN-style externals to Git repositories.

Create a `externals.json` file in your repository root:

```json
{
	"./vendor/shared-lib": {
		"repo": "git@github.com:acme/shared-lib.git",
		"ref": "main",
		"path": "./src"
	}
}
```

Then run:

```bash
git externals

# Then, follow the on-screen instructions printed to your terminal.
```

This command will:

- make sure the `./vendor/shared-lib` folder in your current repository stays in sync with the code in the `./src/` folder on the `main` branch of the `shared-lib.git` repository.
- ensure that a `.externals/externals.code-workspace` file is created that makes it easy to open your repo and its externals in VSCode.
