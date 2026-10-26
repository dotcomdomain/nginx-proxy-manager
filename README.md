## Stream port range fork

Based on Nginx Proxy Manager **v2.16.0**. In **Hosts → Streams**, enter a single
port or an inclusive range in either port field. Supports TCP, UDP, IPv4, IPv6,
and the existing TCP SSL options.

| Incoming | Forwarding | Behavior |
| --- | --- | --- |
| `27015-27030` | `27015-27030` | Preserve each destination port |
| `27015-27030` | `28015-28030` | Map ports in order to a different range |
| `27015-27030` | `8080` | Send all incoming ports to one destination port |
| `2222` | `22` | Existing single-port behavior |

Ranges must be ascending, within `1-65535`, and have equal sizes when forwarding
to a range. The API accepts ranges as strings in `incoming_port` and
`forwarding_port`; ordinary ports remain numbers in responses. Partial updates
are validated against the saved configuration.

Build your own image on a machine with Docker (the upstream prebuilt image does
not contain this fork):

```sh
docker run --rm -v "$PWD/frontend:/app" -w /app node:24-bookworm \
  sh -c 'corepack enable && yarn install --frozen-lockfile && yarn locale-compile && yarn build'
docker buildx build --load -f docker/Dockerfile \
  --build-arg BUILD_VERSION=2.16.0-stream-ranges \
  -t nginx-proxy-manager:stream-ranges .
```

Use `image: nginx-proxy-manager:stream-ranges` in your existing Compose service
and publish the incoming range for each enabled protocol, for example:

```yaml
ports:
  - "80:80"
  - "81:81"
  - "443:443"
  - "27015-27030:27015-27030/tcp"
  - "27015-27030:27015-27030/udp"
```

Keep your existing `/data` and `/etc/letsencrypt` mounts. Back up the database
before upgrading: startup migrates the stream port columns to strings while
preserving existing entries. Rolling back the migration requires removing all
range entries, including soft-deleted ones, first. Do not reuse a migrated
database with an unmodified upstream image without restoring a backup.

Each incoming port needs an available listening socket and must be allowed by
your firewall. Avoid overlapping listeners. A range forwarding to one port uses
Nginx's native range syntax; a range forwarding to a range creates one server
block per port per protocol, so large ranges increase configuration size and
resource use. This fork does not publish Docker ports or change firewalls for you.

Run backend regression tests with `cd backend && npm install && npm test`.
Run frontend checks with `cd frontend && npm install && npm run locale-compile &&
npm test -- --run && npm run build`. The included GitHub workflow runs these
checks and exercises live TCP/UDP forwarding on Linux. Its optional template is
at `scripts/ci/stream-port-ranges.yml`; copy it to `.github/workflows/` to enable
it after granting your GitHub login permission to upload workflows.

---

<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.16.0-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
</p>

This project comes as a pre-built Docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Full Setup](https://nginxproxymanager.com/setup/)
- [Screenshots](https://nginxproxymanager.com/screenshots/)

## Project Goal

I created this project to fill a personal need to provide users with an easy way to accomplish reverse
proxying hosts with SSL termination, and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options, they are optional, and the project should be as simple as possible
so that the barrier to entry here is low.

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>


## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- Easily create forwarding domains, redirections, streams, and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions, and audit log

::: warning
`armv7` is no longer supported in version 2.14+. This is due to Nodejs dropping support for armhf. Please
use the `2.13.7` image tag if this applies to you.
:::

## Hosting your home network

I won't go into too much detail here, but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for ports 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like
   - DuckDNS
   - [Amazon Route53](https://github.com/jc21/route53-ddns)
   - [Cloudflare](https://github.com/jc21/cloudflare-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web-based services

## Quick Setup

1. [Install Docker](https://docs.docker.com/install/)
2. Create a docker-compose.yml file similar to this:

```yml
services:
  app:
    image: 'docker.io/jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

This is the bare minimum configuration required. See the [documentation](https://nginxproxymanager.com/setup/) for more.

3. Bring up your stack by running

```bash
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.

[http://127.0.0.1:81](http://127.0.0.1:81)


## Contributing

All are welcome to create pull requests for this project, against the `develop` branch. Official releases are created from the `master` branch.

CI is used in this project. All PR's must pass before being considered. After passing,
docker builds for PR's are available on dockerhub for manual verifications.

Documentation within the `develop` branch is available for preview at
[https://develop.nginxproxymanager.com](https://develop.nginxproxymanager.com)


### Contributors

Special thanks to [all of our contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).


## Getting Support

1. [Found a bug?](https://github.com/NginxProxyManager/nginx-proxy-manager/issues)
2. [Discussions](https://github.com/NginxProxyManager/nginx-proxy-manager/discussions)
3. [Reddit](https://reddit.com/r/nginxproxymanager)
