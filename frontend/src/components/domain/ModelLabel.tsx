export default function ModelLabel({
  model,
  cachedLabel,
}: {
  model: string | null;
  cachedLabel?: string;
}) {
  const label =
    cachedLabel ||
    (model?.startsWith('gemma4:') ? 'Gemma' : model?.startsWith('openai:') ? 'GPT' : model);
  return label ? <small>{label}</small> : null;
}
