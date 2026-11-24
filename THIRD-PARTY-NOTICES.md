# Third-party notices

This project ships or installs the works below. Each one keeps its own licence.

## Shipped in this repository

Paths are inside the plugin folder `com.psynalytics.claude-usage.sdPlugin`.

| Work | Where it is used | Licence | Source |
|---|---|---|---|
| sdpi-components 4.0.1 | `ui/libs/sdpi-components.js`, the settings panel | MIT | [GeekyEggo/sdpi-components](https://github.com/GeekyEggo/sdpi-components) |
| Lit | Bundled inside `ui/libs/sdpi-components.js` | BSD-3-Clause | [lit/lit](https://github.com/lit/lit) |
| Phosphor Icons, duotone weight | The seven icon shapes in `bin/icons.js`, `imgs/action-icon.svg` and `imgs/category-icon.svg`, and the gauge drawn in `imgs/dial-icon.png`, `imgs/dial-icon@2x.png`, `imgs/plugin-icon.png` and `imgs/plugin-icon@2x.png`. The icons also appear in the repository's `docs/hero.png` and `docs/chart-styles.png` | MIT | [phosphor-icons/core](https://github.com/phosphor-icons/core) |

## Installed by npm

These packages are not part of the repository. Running `npm install` in the plugin folder fetches them from the npm registry. Each package carries its own licence file. The versions are the ones pinned in `package-lock.json`.

| Package | Version | Licence | Source |
|---|---|---|---|
| @elgato/streamdeck | 2.1.2 | MIT | [elgatosf/streamdeck](https://github.com/elgatosf/streamdeck) |
| @elgato/schemas | 0.4.16 | MIT | [elgatosf/schemas](https://github.com/elgatosf/schemas) |
| @elgato/utils | 0.6.0 | MIT | [elgatosf/streamdeck](https://github.com/elgatosf/streamdeck) |
| ws | 8.21.3 | MIT | [websockets/ws](https://github.com/websockets/ws) |
| zod | 3.25.76 | MIT | [colinhacks/zod](https://github.com/colinhacks/zod) |

## Licence texts

### sdpi-components

The shipped file opens with the notice `sdpi-components v4.0.1, Copyright Corsair Memory Inc. and other contributors (https://sdpi-components.dev)`. The licence text below is the one in the sdpi-components repository.

```text
MIT License

Copyright (c) 2024 Corsair Memory Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Lit

The shipped file carries the notice `Lit, Copyright 2019 Google LLC, SPDX-License-Identifier: BSD-3-Clause (https://lit.dev/)`. The licence text below is the one in the Lit repository.

```text
BSD 3-Clause License

Copyright (c) The Lit Project Contributors.
Copyright (c) 2017 Google LLC. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Phosphor Icons

```text
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
