# vanished

A fixture. The build that takes a site off Google.

```sh
node ../../src/cli.ts examples/vanished --site example.com
```

Four mechanisms, in four different files, each of which alone is enough:

| Where | What |
| --- | --- |
| every `*.html` | `<meta name="robots" content="noindex, nofollow">` |
| `_headers` | `X-Robots-Tag: noindex` on `/*` — invisible from the markup |
| `robots.txt` | `Disallow: /` for every crawler |
| `contact/index.html` | a canonical pointing at a `vercel.app` preview |

Nothing here fails a build. Nothing here fails a test. Every one of these is a
file somebody edited for a good reason on a staging branch.

The last one is the cruel one: that page is perfectly indexable and volunteers
its ranking to a preview deploy. It is also the mechanism that has taken
production sites out of the results without anybody touching production.
