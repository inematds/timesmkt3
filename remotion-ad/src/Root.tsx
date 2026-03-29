import React from 'react';
import { Composition } from 'remotion';
import { ColdBrewAd } from './ColdBrewAd';
import { DynamicAd, ScenePlanProps } from './DynamicAd';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRaleway } from '@remotion/google-fonts/Raleway';
import { loadFont as loadBebas } from '@remotion/google-fonts/BebasNeue';

// Pre-load fonts
loadInter();
loadMontserrat();
loadPlayfair();
loadOswald();
loadSpaceGrotesk();
loadPoppins();
loadRaleway();
loadBebas();

// Default scene plan for preview in Remotion Studio
const defaultScenePlan: ScenePlanProps = {
  titulo: 'Preview',
  scenes: [
    {
      scene_id: 1, tipo: 'hook', nome: 'Hook',
      frame_inicio: 0, frame_fim: 90, duracao_frames: 90,
      descricao_visual: 'Hook scene',
      text_overlay: { texto: 'Bom dia.', animacao: 'per-word' },
    },
    {
      scene_id: 2, tipo: 'produto_em_acao', nome: 'Produto',
      frame_inicio: 90, frame_fim: 210, duracao_frames: 120,
      descricao_visual: 'Product scene',
      text_overlay: { texto: 'Suave e refrescante.', entrada_frame: 30 },
      assets_remotion: ['coffee_can.png via staticFile()'],
    },
    {
      scene_id: 3, tipo: 'benefit', nome: 'Benefício',
      frame_inicio: 210, frame_fim: 330, duracao_frames: 120,
      descricao_visual: 'Benefit scene',
      text_overlay: { texto: 'Sem amargor. Puro sabor.', animacao: 'per-word', entrada_frame: 20 },
      assets_remotion: ['coffee_can.png via staticFile()'],
    },
    {
      scene_id: 4, tipo: 'cta', nome: 'CTA',
      frame_inicio: 330, frame_fim: 450, duracao_frames: 120,
      descricao_visual: 'CTA scene',
      text_overlay: { texto: 'Experimente agora.' },
      assets_remotion: ['coffee_can.png via staticFile()'],
    },
  ],
  paleta_cores: {
    coffee_dark: '#2C1A0E',
    coffee_mid: '#4B2E1A',
    cold_blue: '#BFD9E8',
    amber: '#F5A623',
    off_white: '#F9F5F0',
  },
  cta_final: 'Experimente agora.',
  cta_acao: 'Compre Agora',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Original hardcoded composition (1080x1080, 20s) */}
      <Composition
        id="ColdBrewAd"
        component={ColdBrewAd}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1080}
      />

      {/* Dynamic composition driven by scene plan JSON (9:16 vertical) */}
      <Composition
        id="DynamicAd"
        component={DynamicAd}
        durationInFrames={750}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultScenePlan}
        calculateMetadata={({ props }) => ({
          durationInFrames: (props as ScenePlanProps).total_frames as number || 750,
        })}
      />

      {/* Dynamic composition square format (1:1) */}
      <Composition
        id="DynamicAdSquare"
        component={DynamicAd}
        durationInFrames={750}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={defaultScenePlan}
      />
    </>
  );
};
