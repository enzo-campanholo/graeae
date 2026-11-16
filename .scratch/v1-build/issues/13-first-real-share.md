# 13: First real share

**What to build:** Nothing. The owner deploys the integration branch and proves that real media flows before the rest of the media work is built on it.

**Blocked by:** 12

**Status:** ready-for-human

- [ ] Deploy once with one secret left out: the deploy fails and names it
- [ ] Deploy the integration branch with real secrets, under a different Worker name to keep it apart from anything else deployed
- [ ] Deploy again with the secrets file removed: the instance still works
- [ ] Run setup, create an invite and join from a second browser
- [ ] Share a webcam from one browser and watch it from the other: the picture plays
- [ ] Stop the share: it leaves the viewer's stage at once
- [ ] Watch once more with the viewer forced onto the relay, if the browser allows it, or from the member known to need the relay
- [ ] Anything that fails is fixed on the integration branch before this ticket is resolved
