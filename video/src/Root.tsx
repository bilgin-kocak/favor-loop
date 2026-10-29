import { Composition } from "remotion";
import { FavorLoop } from "./FavorLoop";
import { FPS, T } from "./time";

export const Root: React.FC = () => (
  <Composition id="FavorLoop" component={FavorLoop} durationInFrames={Math.round(T.duration * FPS)} fps={FPS} width={1920} height={1080} />
);
