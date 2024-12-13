import React, { useEffect, useRef, useState } from 'react';
import { useBlockNumber, useBlock } from 'wagmi';
import { Block } from 'viem';

const CHAINS = [{
  name: 'Ethereum mainnet',
  image: "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",
  chainId: 1
}, {
  name: "Base",
  image: "https://icons.llamao.fi/icons/chains/rsz_base.jpg",
  chainId: 8453
}, {
  name: "Avalance",
  image: "https://icons.llamao.fi/icons/chains/rsz_avalanche.jpg",
  chainId: 43114
}];

interface Notes {
  scale: number[];
  midiToFrequency: (midi: number) => number;
}

interface NoteInfo {
  blockNumber: bigint;
  note: number;
  frequency: string;
  duration: string;
  gasUsed: string;
}

const notes: Notes = {
  scale: [60, 62, 64, 65, 67, 69, 71, 72], // C major scale
  midiToFrequency: (midi: number) => 440 * Math.pow(2, (midi - 69) / 12) // A4, 440hz 
};

const Blocksound = () => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [noteInfo, setNoteInfo] = useState<NoteInfo | null>(null);
  const [chainId, setChainId] = useState<number>(8453);

  const { data: blockNumber } = useBlockNumber({ watch: true, chainId });
  const { data: block } = useBlock({ blockNumber, chainId });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (block && isPlaying && audioContextRef.current) {
      playBlockMusic(block);
    }
  }, [block, isPlaying]);

  const initializeAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.connect(audioContextRef.current.destination);
      analyserRef.current.fftSize = 2048;
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playBlockMusic = (block: Block) => {
    if (!audioContextRef.current || !analyserRef.current || !block.number || !block.hash) return;

    const midiNote = notes.scale[Number(block.number % BigInt(notes.scale.length))];
    const frequency = notes.midiToFrequency(midiNote);
    const velocity = (parseInt(block.hash.slice(2, 4), 16) % 64 + 64) / 127;
    //const duration = Math.max(0.25, Math.min(10.0, Number(block.gasUsed) / 1000000000)); //1000000000
    const duration = Math.max(0.25, Number(block.gasUsed) / 2000000);

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    oscillator.type = 'sine'; // sine, square, sawtooth, triangle
    oscillator.frequency.value = frequency;

    const now = audioContextRef.current.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(analyserRef.current);
    oscillator.start(now);
    oscillator.stop(now + duration);

    setNoteInfo({
      blockNumber: block.number,
      note: midiNote,
      frequency: frequency.toFixed(2),
      duration: duration.toFixed(2),
      gasUsed: block.gasUsed.toString(),
    });
  };

  const drawVisualizer = () => {
    if (!analyserRef.current || !canvasRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      if (!isPlaying) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current!.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, width, height);
      ctx.lineWidth = 2;

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = v * height / 2;

          // const greenIntensity = Math.floor(Math.abs(v) * 255);
          // ctx.strokeStyle = `rgb(0, ${greenIntensity}, 0)`;

          // hue from amplitude
          // const hue = Math.floor(Math.abs(v) * 360);
          // ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;

          // rgb from amplitude
          const r = Math.floor(Math.abs(v) * 255);
          const g = Math.floor(255 - Math.abs(v) * 255);
          const b = Math.floor(Math.abs(v) * 127);
          ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

          // Draw segment
          if (i === 0) {
              ctx.beginPath();
              ctx.moveTo(x, y);
          } else {
              ctx.lineTo(x, y);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(x, y);
          }
          x += sliceWidth;
      }
    };
    draw();
  };

  useEffect(() => {
    if (isPlaying) {
      drawVisualizer();
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  const handleStart = () => {
    initializeAudio();
    setIsPlaying(true);
  };

  const handleStop = () => {
    setIsPlaying(false);

    if (audioContextRef.current) {
      audioContextRef.current.suspend();
    }
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <main className="w-full h-full">
      <div className="w-full flex p-4 items-center justify-between">
        <h2>
          relax with sounds of the blockchain
        </h2>
        <div className="flex gap-4">
          <button 
            type="button"
            className="hover:bg-blue-400 bg-blue-700 rounded px-4"
            onClick={handleStart}
            disabled={isPlaying}
          >
            Start Music
          </button>
          <button 
            type="button"
            className="bg-transparent rounded px-4"
            onClick={handleStop}
            disabled={!isPlaying}
          >
            Stop Music
          </button>
        </div>
      </div>

      <div className="flex flex-row p-4">
        {CHAINS.map((chain) => (
          <button 
            key={chain.chainId}
            type="button" 
            className={`flex flex-row gap-2 mr-4 border rounded px-4 py-2 ${chain.chainId === chainId && 'bg-blue-400'}`} 
            onClick={() => setChainId(chain.chainId)}
          >
            <img src={chain.image} width="24" height="24"/> {chain.name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="bg-black rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-1/2"
          />
        </div>
        {noteInfo && (
          <div className="bg-secondary p-4 rounded-lg space-y-1">
            <p>Block: {noteInfo.blockNumber.toString()}</p>
            <p>Note: {noteInfo.note}</p>
            <p>Frequency: {noteInfo.frequency} Hz</p>
            <p>Duration: {noteInfo.duration}s</p>
            <p>Gas used: {noteInfo.gasUsed}</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Blocksound;