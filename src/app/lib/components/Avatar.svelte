<script lang="ts">
  // A member's initial in a grey circle. The shares carry the colour, so the only colour
  // an avatar ever shows is the eye: the lit dot on the member you follow.
  import { cn } from "$lib/utils.js";

  let {
    name,
    large = false,
    followed = false,
    away = false,
    reconnecting = false,
    sharing = false,
    ring = "var(--ground)",
    class: className,
  }: {
    name: string;
    /** The rail's and the owner page's size, rather than a row's. */
    large?: boolean;
    followed?: boolean;
    away?: boolean;
    /** Present, but not heard for about 10 seconds: the avatar fades in and out while they reconnect. */
    reconnecting?: boolean;
    /** Brighter while the member has a live share, for the rail. */
    sharing?: boolean;
    /** The colour behind the avatar, which the eye dot is cut out of. */
    ring?: string;
    class?: string;
  } = $props();

  const initial = $derived(
    ([...new Intl.Segmenter().segment(name.trim())][0]?.segment ?? "?").toLocaleUpperCase(),
  );
</script>

<span
  class={cn("avatar", large && "large", away && "away", reconnecting && "reconnecting", sharing && "sharing", className)}
  style:--cutout={ring}
  aria-hidden="true"
>
  {initial}
  {#if followed}<i class="eye"></i>{/if}
</span>

<style>
  .avatar {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: var(--avatar);
    height: var(--avatar);
    border-radius: 50%;
    background: var(--raised-2);
    color: var(--soft);
    font-size: var(--avatar-text);
    font-weight: 600;
    line-height: 1;
  }
  .large {
    width: var(--avatar-lg);
    height: var(--avatar-lg);
    font-size: var(--avatar-lg-text);
  }
  .sharing {
    color: var(--fg);
  }
  .away {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--raised-2);
    color: var(--dim);
  }
  /* Present but not heard: still a filled circle, breathing slowly instead of gone. */
  .reconnecting {
    animation: reconnecting 1.6s ease-in-out infinite alternate;
  }
  @keyframes reconnecting {
    to {
      opacity: 0.4;
    }
  }
  .eye {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--eye);
    box-shadow: 0 0 0 2px var(--cutout);
    animation: light 220ms var(--ease-out);
  }
  .large .eye {
    width: 11px;
    height: 11px;
  }
  @keyframes light {
    from {
      transform: scale(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .eye {
      animation: none;
    }
    .reconnecting {
      animation: none;
      opacity: 0.55;
    }
  }
</style>
