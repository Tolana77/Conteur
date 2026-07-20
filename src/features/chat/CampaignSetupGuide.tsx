import { useGameStore } from "../../store/useGameStore";
import { IlluminatedInitial } from "../../ui/components/IlluminatedInitial";
import { useMultiplayerStore } from "../multiplayer/useMultiplayerStore";
import {
  canPlayMultiplayerCharacter,
  isMultiplayerAdmin,
  isMultiplayerGm,
} from "../multiplayer/permissions";

interface CampaignSetupGuideProps {
  onOpenCharacterCreation?: () => void;
  onOpenWorldWorkshop?: () => void;
}

export function CampaignSetupGuide({
  onOpenCharacterCreation,
  onOpenWorldWorkshop,
}: CampaignSetupGuideProps) {
  const campaign = useGameStore((state) => state.campaign);
  const characterCount = useGameStore((state) => state.characters.length);
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const awaitingHostState = useMultiplayerStore((state) => state.awaitingHostState);
  const pendingCharacterRequest = useMultiplayerStore((state) => state.pendingCharacterRequest);
  const campaignIsConfigured = campaign.id !== "campaign-empty";
  const isPlayerParticipant = canPlayMultiplayerCharacter(self);
  const needsCharacter = campaignIsConfigured && (
    room ? Boolean(isPlayerParticipant && !self?.characterId) : characterCount === 0
  );
  const canCreateCampaign = !room || isMultiplayerAdmin(self);

  let initial = "V";
  let title = "Vous êtes maintenant prêts à commencer";
  let description = `La campagne « ${campaign.name} » et votre personnage sont chargés. Le Conteur attend votre première décision.`;
  let action: { label: string; onClick?: () => void } | null = null;

  if (room && awaitingHostState) {
    initial = "L";
    title = "La campagne est en préparation";
    description = "L’univers est en cours de synchronisation. Vous pourrez ensuite créer votre personnage ici même.";
  } else if (!campaignIsConfigured) {
    initial = "C";
    if (room && !canCreateCampaign) {
      title = "La campagne est en préparation";
      description = "L’univers sera bientôt synchronisé. Vous pourrez ensuite créer votre personnage ici même.";
    } else {
      title = "Créez votre campagne dans l’Atelier";
      description = "Définissez l’univers et chargez-le avant de donner naissance aux personnages qui vont l’habiter.";
      action = { label: "Ouvrir l’Atelier", onClick: onOpenWorldWorkshop };
    }
  } else if (needsCharacter) {
    initial = "C";
    if (pendingCharacterRequest) {
      title = "Votre personnage rejoint la campagne";
      description = "La fiche a été envoyée et attend son installation. Vous pouvez consulter son avancement dans l’onglet Création.";
    } else {
      title = "Créez votre personnage";
      description = `La campagne « ${campaign.name} » est chargée. Composez maintenant un personnage cohérent avec cet univers.`;
    }
    action = { label: "Ouvrir la création", onClick: onOpenCharacterCreation };
  } else if (room && self?.role === "spectator") {
    initial = "L";
    title = "La partie est prête";
    description = "Vous observez la campagne. Les paroles et les événements visibles apparaîtront dans ce fil.";
  } else if (room && isMultiplayerGm(self)) {
    initial = "L";
    title = "La campagne est prête";
    description = "Les participants peuvent maintenant créer leur personnage et rejoindre la scène d’ouverture.";
  }

  return (
    <section className="parchment-reading reading-border mx-auto mb-4 max-w-[760px] rounded-sm p-5">
      <p className="rune-label mb-1 text-[10px]">{campaignIsConfigured ? campaign.name : "Mise en place"}</p>
      <h2 className="ink-heading text-lg font-semibold text-[#15121A]">
        <IlluminatedInitial genre="fantasy">{initial}</IlluminatedInitial>
        {title.slice(1)}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#15121A]/80">{description}</p>
      {action ? (
        <button
          className="mt-3 border border-[#5A2233] bg-[#5A2233] px-3 py-2 text-sm font-semibold text-[#E4D8BE]"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
