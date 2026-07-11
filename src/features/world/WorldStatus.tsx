import { useGameStore } from "../../store/useGameStore";

export function WorldStatus() {
  const campaign = useGameStore((state) => state.campaign);

  return (
    <section className="manuscript-panel rounded p-3 text-sm">
      <h2 className="ink-heading font-bold">{campaign.name}</h2>
      <p className="mt-1 text-[#E4D8BE]/65">{campaign.style}</p>
      <p className="mt-2 text-[#E4D8BE]/78">{campaign.world.facts[0]}</p>
    </section>
  );
}
