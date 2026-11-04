# MVP stories and observable outcomes

| Story              | Journey                                              | Observable success                                                                       |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Create art         | Choose preset, draw, or import allowed SVG           | Editor holds validated ordered strokes; invalid SVG produces an actionable error.        |
| Correct art        | Undo, redo, clear, transform                         | Preview and canonical stroke state agree after each edit.                                |
| Place art          | Choose Lyon location, start, scale and rotation      | Geographic overlay preserves aspect ratio and meter-based scale; reset returns to Lyon.  |
| Set activity       | Choose walk, run, or cycle and target km             | Valid settings enter the request; invalid distance blocks submission with a field error. |
| Generate           | Submit valid single-stroke drawing in covered region | UI shows progress, then an actual continuous network path or a typed failure.            |
| Compare            | Select one of up to three distinct candidates        | Map and measured distance/fidelity/retracing update together.                            |
| Export             | Choose GPX or GeoJSON on validated result            | Download reimports to the same geographic track; raw target has no navigable export.     |
| Recover draft      | Reload browser                                       | Valid versioned local draft restores; corrupt or incompatible data resets with feedback. |
| Engine unavailable | Generate while local router is down                  | Actionable error explains service setup and offers retry without losing input.           |
| No route           | Ask for impossible or out-of-coverage art            | No success claim or fabricated path; user can edit placement, scale, or shape.           |
| Use phone          | Complete drawing and generation at phone width       | Controls are keyboard/touch accessible and no horizontal page overflow occurs.           |

Accounts and mobile recording are later milestones, not prerequisites for the local editor.
