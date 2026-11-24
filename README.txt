LoanBud - Employee Buyout Financing landing page (v3 draft)

Files
- index.html  page, styles, copy, dialogs and app script
- deal.js     "Build your buyout" deal builder (ES module)
- fx.js       living-photo and transition effects (ES module)
- x3d.js      depth layer: WebGL key scene on the hero, 3D tilt and flip, 3D capital stack, lender strand and globe, count-ups (ES module)
- x3d.css     styles for the depth layer (only active once x3d.js has started)
- vendor/     three.module.min.js (three.js r170, MIT), loaded only on devices with a hardware GPU
- img/        photos (WebP), their looping video versions (MP4, muted, lazy-loaded), official logos, og.jpg share image
- _original/  the page exactly as delivered before the depth layer and videos

Run locally: the page uses ES modules, so open it through a local web server, e.g.
  npx serve .      or      python -m http.server
then visit http://localhost:3000 (or :8000). Opening index.html directly from disk will not load the modules.

Before launch
- Connect the consultation form to HubSpot (search "TODO: connect HubSpot form" in index.html).
- Remove <meta name="robots" content="noindex"> (marked TODO).
- Set the Privacy / Terms / Contact URLs (marked TODO).

Motion
- Every loop, video and 3D scene stops with the pause button on the hero photo and with the visitor's reduced-motion setting.
- QA switches: ?x3=off skips the WebGL key scene, ?x3=force renders it even on a software GPU.
- The photo videos were generated from the page's own stills (image to video) and play as a forward-and-back loop; removing a data-video attribute returns that photo to the still.
