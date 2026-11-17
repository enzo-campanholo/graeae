<script lang="ts">
  // Stand-ins for a share's picture under `pnpm dev`, drawn so the stage can be judged
  // with colour in it, the way real shares will fill it. Never part of a production build.
  import type { Scene } from "./types.ts";

  let { scene }: { scene: Scene } = $props();
</script>

<div class="frame" aria-hidden="true">
  <div class="scene {scene}">
  {#if scene === "game"}
    <i class="sun"></i><i class="cloud"></i>
    {#each [34, 38, 30, 26, 30, 42, 46, 36] as height, i (i)}
      <i class="block" style:left="{i * 12.5}%" style:height="{height}%"></i>
    {/each}
    <i class="trunk"></i><i class="leaves"></i>
    <div class="hotbar">{#each Array.from({ length: 9 }, (_, i) => i) as i (i)}<i class:on={i === 2}></i>{/each}</div>
  {:else if scene === "race"}
    <i class="hills"></i><i class="road"></i><i class="lane"></i><i class="car"></i>
    <b class="pos">2/12</b><b class="speed">187<small>km/h</small></b>
  {:else}
    <i class="shelf"></i><i class="lamp"></i><i class="body"></i><i class="head"></i><i class="hair"></i>
    {#if scene === "webcam"}<i class="phones"></i>{/if}
  {/if}
</div>
</div>

<style>
  /* A 16:9 picture, as large as fits and centred, like a video with object-fit: contain. */
  .frame {
    position: absolute;
    inset: 0;
    container-type: size;
  }
  .scene {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(100cqw, 100cqh * 16 / 9);
    aspect-ratio: 16 / 9;
    transform: translate(-50%, -50%);
    overflow: hidden;
  }
  i,
  b {
    position: absolute;
  }
  .game {
    background: linear-gradient(#78aee4, #c4e0f3 62%);
  }
  .sun {
    right: 16%;
    top: 12%;
    width: 8%;
    aspect-ratio: 1;
    background: #fff6c8;
  }
  .cloud {
    top: 20%;
    left: 18%;
    width: 18%;
    height: 7%;
    background: #fff;
  }
  .block {
    bottom: 0;
    width: 12.6%;
    background: linear-gradient(#6fb04a 0 12%, #7a5636 12% 70%, #6a6a6a 70%);
  }
  .trunk {
    left: 66%;
    bottom: 42%;
    width: 1.6%;
    height: 16%;
    background: #6b4a2b;
  }
  .leaves {
    left: 61%;
    bottom: 56%;
    width: 11%;
    height: 14%;
    background: #3f8a35;
  }
  .hotbar {
    position: absolute;
    left: 50%;
    bottom: 3%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #0008;
  }
  .hotbar i {
    position: static;
    width: 18px;
    height: 18px;
    border: 2px solid #9a9a9a;
  }
  .hotbar i.on {
    border-color: #fff;
  }
  .race {
    background: linear-gradient(#18122e, #5b2f5f 52%, #3a3340 52%);
  }
  .hills {
    left: 0;
    right: 0;
    top: 36%;
    height: 16%;
    background: #2a1f3d;
    clip-path: polygon(0 100%, 14% 30%, 30% 70%, 48% 10%, 66% 60%, 82% 25%, 100% 100%);
  }
  .road {
    left: -10%;
    right: -10%;
    bottom: 0;
    height: 48%;
    background: #2c2c33;
    clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%);
  }
  .lane {
    left: 50%;
    bottom: 0;
    width: 1%;
    height: 48%;
    margin-left: -0.5%;
    background: repeating-linear-gradient(#e9e2c8 0 22px, transparent 22px 48px);
  }
  .car {
    left: 50%;
    bottom: 8%;
    width: 22%;
    height: 13%;
    margin-left: -11%;
    background: #c8332d;
    border-radius: 18px 18px 6px 6px;
    box-shadow: inset 0 -14px 0 #1b1b1f;
  }
  .pos,
  .speed {
    color: #fff;
    font: 800 26px/1 system-ui;
  }
  .pos {
    right: 3%;
    top: 4%;
  }
  .speed {
    right: 3%;
    bottom: 4%;
    text-align: right;
  }
  .speed small {
    display: block;
    font-size: 12px;
    opacity: 0.8;
  }
  .webcam {
    background: #4a3f37;
  }
  .webcam-2 {
    background: #33424a;
  }
  .shelf {
    left: 8%;
    top: 10%;
    width: 30%;
    height: 52%;
    background: #3c332d;
    box-shadow: inset 0 -10px 0 #5c4d42;
  }
  .webcam-2 .shelf {
    display: none;
  }
  .lamp {
    right: 13%;
    top: 14%;
    width: 9%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #f3c97a;
  }
  .webcam-2 .lamp {
    background: #9fd3c7;
  }
  .body {
    left: 22%;
    bottom: -8%;
    width: 56%;
    height: 44%;
    border-radius: 50% 50% 0 0;
    background: #2f5d7c;
  }
  .webcam-2 .body {
    background: #7a3b4c;
  }
  .head {
    left: 40.5%;
    top: 24%;
    width: 19%;
    height: 40%;
    border-radius: 48% 48% 44% 44%;
    background: #c8977a;
  }
  .webcam-2 .head {
    background: #e2b896;
  }
  .hair {
    left: 39.5%;
    top: 20%;
    width: 21%;
    height: 16%;
    border-radius: 50% 50% 20% 20%;
    background: #2b1d16;
  }
  .webcam-2 .hair {
    background: #7a4a2a;
    height: 22%;
  }
  .phones {
    left: 37.5%;
    top: 19%;
    width: 25%;
    height: 30%;
    border: 10px solid #18181b;
    border-bottom: 0;
    border-radius: 50% 50% 0 0;
  }
</style>
