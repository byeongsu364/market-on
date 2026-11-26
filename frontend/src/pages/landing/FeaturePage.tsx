import { Link, Navigate, useParams } from 'react-router-dom';
import { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import BrandLayout from './BrandLayout';
import { FEATURES, featureBySlug } from './features';
import s from './landing.module.css';

/** PC 소개 사이트의 기능별 페이지(/intro/:slug). 내용은 features.ts */
export default function FeaturePage() {
  const { slug } = useParams();
  const feature = featureBySlug(slug);
  if (!feature) return <Navigate to="/" replace />;
  const index = FEATURES.indexOf(feature);
  const next = FEATURES[(index + 1) % FEATURES.length];
  return (
    <BrandLayout>
      <main id="main">
        <section className={s.featureHero} aria-labelledby="feature-title">
          <div className={s.heroText}>
            <p className={s.kicker}>{feature.kicker}</p>
            <h1 id="feature-title" className={s.featureTitle}>
              {feature.title}
            </h1>
            <p className={s.lead}>{feature.lead}</p>
            {feature.cta && (
              <div className={s.cardActions}>
                <ButtonLink to={feature.cta.to} variant="primary" size="md">
                  {feature.cta.label}
                </ButtonLink>
              </div>
            )}
          </div>
          {feature.hero && (
            <img className={s.featureShot} src={feature.hero} alt={feature.heroAlt ?? ''} />
          )}
        </section>

        <section className={s.section} aria-label={`${feature.menu} 자세히`}>
          <div className={s.featureSections}>
            {feature.sections.map((sec, i) => (
              <article
                key={sec.title}
                className={sec.image ? s.featureRow : s.featureBlock}
                data-flip={sec.image && i % 2 === 1 ? 'true' : undefined}
              >
                <div className={s.featureCopy}>
                  <span className={s.stepNo}>{String(i + 1).padStart(2, '0')}</span>
                  <h2 className={s.h3}>{sec.title}</h2>
                  <p className={s.body}>{sec.body}</p>
                  {sec.points && (
                    <ul className={s.points}>
                      {sec.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {sec.image && (
                  <img
                    className={s.featureSideShot}
                    src={sec.image}
                    alt={sec.alt ?? ''}
                    loading="lazy"
                  />
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={s.nextBand} aria-label="다음 기능">
          <Link to={`/intro/${next.slug}`} className={s.nextLink}>
            <span className={s.label}>다음</span>
            <span className={s.nextTitle}>{next.kicker}</span>
            <Icon name="chevronRight" size={24} />
          </Link>
        </section>
      </main>
    </BrandLayout>
  );
}
