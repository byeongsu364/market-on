import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../hooks/useCamera';
import { useAction } from '../hooks/useResource';
import { recognize } from '../api/scan';
import { useItem } from '../hooks/useItem';
import { useRequireMarket } from '../hooks/useFlows';
import ManualInput from '../components/domain/ManualInput';
import { unitLabel } from '../utils/convertUnit';
import type { RecognizeResponse } from '../types/contract';
function Confirmation({ result }: { result: RecognizeResponse }) {
  const [id, setId] = useState(
    result.candidates[0]?.confidence >= 0.8 ? result.candidates[0].item_id : '',
  );
  const item = useItem(id);
  const [price, setPrice] = useState(result.price_tag ? String(result.price_tag.price) : '');
  const [unit, setUnit] = useState(result.price_tag?.unit ?? '');
  const [quantity, setQuantity] = useState(String(result.price_tag?.quantity ?? 1));
  const [search, setSearch] = useState(false);
  const effectiveUnit = item.data?.units.includes(unit) ? unit : item.data?.default_unit;
  const navigate = useNavigate();
  return (
    <section>
      <h2>품목과 가격 확인</h2>
      <div className="chips">
        {result.candidates.slice(0, 3).map((c) => (
          <button
            className="chip"
            key={c.item_id}
            aria-pressed={id === c.item_id}
            onClick={() => setId(c.item_id)}
          >
            {c.name} {Math.round(c.confidence * 100)}%
          </button>
        ))}
      </div>
      <button className="secondary" onClick={() => setSearch(true)}>
        목록에 없어요
      </button>
      {search && <PhotoSearch choose={setId} />}
      {result.price_tag ? (
        <p className="caption">가격표에서 읽었어요 · {result.price_tag.unit_text}</p>
      ) : (
        <p>가격표가 없으면 그냥 넘어가요</p>
      )}
      {result.price_tag || price ? (
        <label>
          가격 (선택)
          <input
            type="number"
            min="10"
            max="10000000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      ) : (
        <button className="secondary" onClick={() => setPrice('0')}>
          가격 입력 (선택)
        </button>
      )}
      <div className="chips">
        {item.data?.units.map((u) => (
          <button
            className="chip"
            key={u}
            aria-pressed={u === effectiveUnit}
            onClick={() => setUnit(u)}
          >
            {unitLabel(u)}
          </button>
        ))}
      </div>
      <label>
        수량
        <input
          type="number"
          min="0.01"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <button
        className="wide"
        disabled={
          !item.data ||
          Number(quantity) <= 0 ||
          (!!price &&
            (!Number.isInteger(Number(price)) || Number(price) < 10 || Number(price) > 10000000))
        }
        onClick={() =>
          navigate(`/items/${encodeURIComponent(id)}`, {
            state: {
              labels: result.vision_labels,
              price: price ? Number(price) : undefined,
              unit: effectiveUnit,
              quantity: Number(quantity),
              method: 'price_tag_photo',
              media_id: result.media_id,
            },
          })
        }
      >
        결과 보기
      </button>
    </section>
  );
}
import { searchItems } from '../api/items';
import { useResource } from '../hooks/useResource';
function PhotoSearch({ choose }: { choose: (id: string) => void }) {
  const [q, setQ] = useState('');
  const items = useResource(useCallback(() => searchItems(q), [q]));
  return (
    <section>
      <label>
        품목 검색
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="chips">
        {items.data?.map((i) => (
          <button className="chip" key={i.item_id} onClick={() => choose(i.item_id)}>
            {i.name}
          </button>
        ))}
      </div>
    </section>
  );
}
export default function Scan() {
  const camera = useCamera();
  const [recognizedFile, setRecognizedFile] = useState<File | null>(null);
  const action = useAction(async (file: File) => {
    try {
      const result = await recognize(file);
      setRecognizedFile(file);
      return result;
    } catch (error) {
      if ((error as { status?: number }).status === 503)
        throw new Error('사진 인식이 잠시 안 돼요. 이름으로 찾아 주세요');
      throw error;
    }
  });
  const ready = useRequireMarket();
  if (!ready) return null;
  return (
    <>
      <h1>사진으로 품목 찾기</h1>
      <p>가격표가 함께 보이게 찍어 주세요</p>
      <label className="file-label">
        사진 촬영 또는 앨범 선택
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => camera.setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {camera.preview && <img className="preview" src={camera.preview} alt="촬영한 사진" />}
      <button
        className="wide"
        disabled={!camera.file || action.loading}
        aria-busy={action.loading}
        onClick={() => camera.file && void action.run(camera.file)}
      >
        품목 확인하기
      </button>
      {action.error && (
        <>
          <p role="alert">{action.error}</p>
          <ManualInput />
        </>
      )}
      {action.data && recognizedFile === camera.file && (
        <Confirmation key={camera.preview + action.data.media_id} result={action.data} />
      )}
    </>
  );
}
