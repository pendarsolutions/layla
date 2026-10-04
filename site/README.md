# Layla's website

The site the API serves at `/` (live at https://pendarsolutions.ir/layla/): a cinematic landing
(«لیلا یعنی شب»: the night, the message, the questions, the answers, the sectors, then dawn and a
live box on the real model) and the working pages: playground, services, docs, sign-in and keys.
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
- `src/pages/`: the working pages, all from the kit's components.
- `src/copy.ts`: the site's own words, in Layla's voice (third person; one of your options, never its own text).
