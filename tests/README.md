# Tests

Playwright driving the real app against a plain static server — the same
way GitHub Pages serves it. No build step and no test framework: a suite
is an ordinary Node script.

```sh
node tests/run.js            # everything
node tests/run.js store      # one suite, by prefix
```

`run.js` starts the server itself on port 8777 and stops it afterwards.
To work on a single suite against a server you already have running:

```sh
python3 -m http.server 8777 &
node tests/store.test.js
```

These used to live outside the repository, in a scratch directory, and
were lost when that directory was recycled. They live here now.
