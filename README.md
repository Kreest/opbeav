# windmill-client
The Windmill is an interactive alternative to pen and paper for creating and
playing puzzles based on the puzzle language of the 2016 video game The Witness.

This project exists for fans of the game who do not want to take out the
IV drip just yet. The puzzle logic is original and exciting, and while
reimplementing it is not original, it is nonetheless an exciting programming
task.

The current status of The Windmill is that it is running at
[https://windmill.thefifthmatt.com](https://windmill.thefifthmatt.com).

## Technical overview
Concretely, this is a codebase which includes an AngularJS app for editing and
playing puzzles, as well as server interaction. Angular is responsible for
everything in the UI except for the puzzle grid itself, which is rendered,
played, and validated by plain old JS code. The grid is shown using SVG and
rendered using the templating language Closure Templates, also known as Soy.
All code uses Closure Library for utilities and is compiled for release using
the Closure Compiler.

Development is currently only supported on Mac OS X and Linux.
Development is active as of March 2016, and technical debt is mainly due to
the build system and all of the existing code.

Additional functionality, for listing puzzles, publishing puzzles, and playing
published puzzles, requires a server to implement an API and serve static files
compiled by windmill-client.

## Getting it running locally quickly
These commands will get it up and running on
your system ASAP, given required tools
(NPM, Java, Python, Bash).

 * npm install
 * ./proto.sh && ./soy.sh && ./compile.sh local
 * python -m SimpleHTTPServer
 * Go to [http://localhost:8000/main.html](http://localhost:8000/main.html)

## How to build
Currently, a pile of Bash scripts. This should move to a build system. This may
be in the npm ecosystem, or even npm itself. Alternatively, Bazel. Whatever has
the best incremental compilation and custom scripting support.

Java 8 JDK and Python 2.7 are required for the client and server.

### Required binaries and libraries
For running the client, either compiled or half-compiled, some dependencies
must be present.

Almost are all available from npm:

 * npm install
 * sudo npm install -g html-minifier

There is additional external content which is already included in the
repository.
See NOTICE for more information.

### Bash scripts
Intermediate (transpiled) targets:

 * `./proto.sh` takes the contents of grid.proto and outputs JS to dist/proto.js
   containing the proto definitions.
 * `./soy.sh` takes Soy in windmill.soy and constants in constants.js and
   grid.proto and compiles the templates. It notifies using notify-send on
   failures and success.
   * `./soy.sh static` also regenerates SVG files in static/.

The three compile modes:

 * `./compile.sh all` compiles HTML files and Angular templates. main.html
   becomes build.html, src/\*.tmpl.html becomes static/\*.tmpl.html. All
   JavaScript gets compiled to static/code.js (requires soy.sh and proto.sh
   output). This makes it possible to access build.html.
 * `./compile.sh` only compiles HTML
 * `./compile.sh local` outputs dist/runlocal.js and dependencies, which makes
   it possible to access main.html for live-editing uncompiled code.

It is recommended to use these commands in the background with entr for
live-editing uncompiled code:

 * ls src/windmill.soy src/constants.js src/grid.proto | entr ./soy.sh
 * ls src/grid.proto | entr ./proto.sh

## How to run
Most local development of the client involves running

* python -m SimpleHTTPServer

From the repository root. Then, access

* [http://localhost:8000/main.html](http://localhost:8000/main.html)
  for uncompiled
* [http://localhost:8000/build.html](http://localhost:8000/build.html)
  for compiled

Finally, there is a third way to run, which is with a full-fledged API server.
This requires a PostgreSQL database and a whole separate tech stack,
coming soon as a sister repository on Github.

## Contributing and testing
If you are interested in contributing in any form, file a bug, comment on one,
or otherwise contact me! I will be responsive as work/home allows.

JavaScript tends to follow the [Google JavaScript style
guide](https://google.github.io/styleguide/javascriptguide.xml).

Note that because there are many missing features, many parts of the code base
are not very stable. There are several planned refactorings.
The overall structure is set in stone, however.

Generally, released features should not be broken at HEAD.
In other words, please avoid regressions.
So unit tests are definitely planned, mainly for grid validation code.
Meanwhile, the policy is to thoroughly manually test,
both uncompiled and compiled.
