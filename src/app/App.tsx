import { GamePage } from "../pages/GamePage";
import { MultiplayerBridge } from "../features/multiplayer";

export default function App() {
  return (
    <>
      <MultiplayerBridge />
      <GamePage />
    </>
  );
}
