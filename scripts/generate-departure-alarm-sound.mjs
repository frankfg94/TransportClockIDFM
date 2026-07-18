import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 22_050;
const durationSeconds = 60;
const frameCount = sampleRate * durationSeconds;
const bytesPerSample = 2;
const dataSize = frameCount * bytesPerSample;
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../android/app/src/main/res/raw/transport_departure_alarm.wav",
);
const wav = Buffer.alloc(44 + dataSize);

wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
wav.writeUInt16LE(bytesPerSample, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);

for (let frame = 0; frame < frameCount; frame += 1) {
  const time = frame / sampleRate;
  const cycleTime = time % 2.5;
  const tone = getTone(cycleTime);
  const sample = tone
    ? getAlarmSample(time, cycleTime, tone.start, tone.end, tone.frequency)
    : 0;

  wav.writeInt16LE(Math.round(sample * 32_767), 44 + frame * bytesPerSample);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, wav);

function getTone(cycleTime) {
  if (cycleTime < 0.28) {
    return { start: 0, end: 0.28, frequency: 880 };
  }

  if (cycleTime >= 0.38 && cycleTime < 0.66) {
    return { start: 0.38, end: 0.66, frequency: 880 };
  }

  if (cycleTime >= 0.76 && cycleTime < 1.12) {
    return { start: 0.76, end: 1.12, frequency: 1_046.5 };
  }

  return undefined;
}

function getAlarmSample(time, cycleTime, start, end, frequency) {
  const fadeDuration = 0.018;
  const fromStart = cycleTime - start;
  const toEnd = end - cycleTime;
  const envelope = Math.min(
    1,
    fromStart / fadeDuration,
    toEnd / fadeDuration,
  );
  const fundamental = Math.sin(2 * Math.PI * frequency * time);
  const harmonic = Math.sin(2 * Math.PI * frequency * 2 * time) * 0.17;

  return (fundamental + harmonic) * envelope * 0.46;
}
