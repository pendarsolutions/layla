# Layla's website

The site the API serves at `/` (live at https://pendarsolutions.ir/layla/), three pages told the
same way, night, dawn, day («لیلا یعنی شب»): the cinematic landing (the message, the questions, the
answers, the sectors, then dawn and a chat on the real model, `#try`), the docs (`#/docs`) and the
API keys with Google sign-in (`#/keys`). Old addresses still work: `#/play` and `#/services` go to
the landing's chat and sectors (`?service=…` sends that sector's example), `#/login` to the keys.
The top bar's «API» is `#/api` (the docs page: what the API does, three steps to a first answer,
then the reference); signed in, the keys page is the account (who you are, the free requests as a
wall of bricks, the keys, the last 30 days).
Built on Pendar's design system from Specimen: `@pendar/ui` and `@pendar/layla` (Layla's kit and
night-lapis theme), with GSAP and Lenis for the scroll. Persian first, with English (`?lang=en`).

```sh
cd site
export SPECIMEN_TOKEN=dsp_…      # a Specimen API token: the kits install from Specimen
npm install
npm run sync                     # favicons, manifest, app icons and link previews from Specimen (brand "layla")
npm run dev                      # http://127.0.0.1:5320 (append ?api=https://pendarsolutions.ir/layla to talk to the live API)
npm run build                    # typecheck, then build into ../web (the Persian landing is prerendered)
```

Commit `web/` with the source: the API image copies it as it is, with no Node in the build.
Deploy as always: `scripts/deploy.sh user@host` from the repo root.

- `src/landing/`: the landing, its sky and its motion (`motion.ts`). Every scrubbed step writes down
  its start (`fromTo`), and triggers below the pinned scenes measure after them (`refreshPriority: -1`).
- `src/pages/`: the docs and the keys, each a night head (`Shell.tsx` `Page`) and the day, with
  their motion (`motion.ts`). `src/lib/motion.ts` holds what every page shares: the eases, the
  smooth scroll, the jumps and the brick wall that covers them, between pages too.
- `src/chat/`: the chat at the end of the landing.
- `src/copy.ts`: the site's own words, in Layla's voice (third person; one of your options, never its own text).
