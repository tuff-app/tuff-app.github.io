# TUFF website

The source of [tuff-app.github.io](https://tuff-app.github.io/): the TUFF
homepage and the [benchmark leaderboard](https://tuff-app.github.io/benchmarks/).

| Path | What it is |
| --- | --- |
| `index.html` | The homepage |
| `benchmarks/` | The leaderboard page and its script |
| `assets/` | Images |
| `TUFF/` | Redirects from the old `tuff-app.github.io/TUFF/` addresses |

It's plain HTML, CSS and JavaScript with no build step. To preview it, run
`python3 -m http.server` here and open http://localhost:8000.

The leaderboard data isn't stored here. Every hour, and on each push,
`.github/workflows/deploy.yml` reads the reviewed posts in TUFF's
[Benchmarks discussions](https://github.com/tuff-app/TUFF/discussions/categories/benchmarks)
with TUFF's `Scripts/benchmark_discussions.py`, writes `benchmarks/data.json`
and deploys the site. Nothing in a post is ever executed. See
[how benchmarks work](https://github.com/tuff-app/TUFF/blob/main/docs/BENCHMARKS.md).

## Contributing

TUFF is one project split across a few repositories:

| Repository | What's in it |
| --- | --- |
| [TUFF](https://github.com/tuff-app/TUFF) | The Mac app, the `tuff` command and the inference engines |
| [sandbox](https://github.com/tuff-app/sandbox) | The Linux VM that runs web and file search in isolation |
| [homebrew-tap](https://github.com/tuff-app/homebrew-tap) | The Homebrew cask |
| [tuff-app.github.io](https://github.com/tuff-app/tuff-app.github.io) | The website and benchmark leaderboard |

They all follow the same
[contributing guide](https://github.com/tuff-app/.github/blob/main/CONTRIBUTING.md),
[maintainer roles](https://github.com/tuff-app/.github/blob/main/MAINTAINERS.md)
and [code of conduct](https://github.com/tuff-app/.github/blob/main/CODE_OF_CONDUCT.md).
Questions and ideas go in [Discussions](https://github.com/tuff-app/TUFF/discussions).

## Security

Please don't open a public issue for a security problem. Report it privately
through GitHub's vulnerability reporting on the repository it affects, or on
[TUFF](https://github.com/tuff-app/TUFF/security/advisories/new) if you're not
sure which. The [security policy](https://github.com/tuff-app/.github/blob/main/SECURITY.md)
has the details.

## License

[Apache 2.0](LICENSE). Model weights keep their own terms.
