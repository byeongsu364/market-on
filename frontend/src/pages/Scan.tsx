import { useScanFlow, useRequireMarket } from '../hooks/useFlows';
import { useT } from '../i18n';
import Button from '../components/common/Button';
import ErrorBox from '../components/common/ErrorBox';
import Resource from '../components/common/Resource';
export default function Scan() {
  const f = useScanFlow();
  const ready = useRequireMarket();
  const t = useT();
  if (!ready) return null;
  return (
    <>
      <h1>{t('scanTitle')}</h1>
      <p>{t('photoPurpose')}</p>
      <label className="file-label">
        {t('camera')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => f.camera.setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {f.camera.preview ? (
        <img className="preview" src={f.camera.preview} alt={t('photoPreview')} />
      ) : (
        <div className="photo-placeholder">{t('photoPlaceholder')}</div>
      )}
      <Button
        className="wide"
        loading={f.recognition.loading}
        disabled={!f.camera.file}
        onClick={f.run}
      >
        {t('recognize')}
      </Button>
      {f.recognition.error && <ErrorBox message={f.recognition.error} />}
      <p className="caption">
        {t('recognizeSample')}
        <br />
        {t('uncertainHint')}
      </p>
      {f.recognition.data && (
        <section>
          <small>
            {t('visionLabels')}
            {f.recognition.data.vision_labels.join(', ')}
          </small>
          <div className="chips">
            {f.recognition.data.candidates.map((c) => (
              <button className="chip" key={c.item_id} onClick={() => f.choose(c.item_id)}>
                {c.name} {Math.round(c.confidence * 100)}%
              </button>
            ))}
          </div>
        </section>
      )}
      <button className="secondary" onClick={() => f.setSearching(true)}>
        {t('missing')}
      </button>
      {f.searching && (
        <section>
          <label>
            {t('search')}
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={f.q}
              onChange={(e) => f.setQ(e.target.value)}
            />
          </label>
          <Resource state={f.search}>
            <div className="chips">
              {f.search.data?.map((i) => (
                <button className="chip" key={i.item_id} onClick={() => f.choose(i.item_id)}>
                  {i.name}
                </button>
              ))}
            </div>
            {f.search.data?.length === 0 && <p>{t('searchEmpty')}</p>}
          </Resource>
        </section>
      )}
    </>
  );
}
