"""Read-only adapters: all data access goes through existing services."""

from pydantic import BaseModel, Field

from app.core.errors import AppError
from app.schemas.ask import AskRequest
from app.schemas.recommend import RecommendRequest
from app.services import (
    ask_service,
    item_service,
    market_service,
    price_service,
    recipe_service,
    recommend_service,
    sale_service,
)


class Search(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class ItemArg(BaseModel):
    item_id: str


class RecipeArg(ItemArg):
    q: str | None = Field(default=None, max_length=200)


class PriceArg(ItemArg):
    variety_id: str | None = None
    unit: str | None = None


class SaleArg(BaseModel):
    item_id: str | None = None


class AskArg(ItemArg):
    question: str = Field(min_length=1, max_length=200)


LABELS = {
    'find_recipes': '레시피로 장보기',
    'search_items': '품목 찾기',
    'reference_price': '기준시세 확인',
    'find_stores': '판매 점포 찾기',
    'active_sales': '마감세일 확인',
    'ask_knowledge': '근거 자료 찾기',
    'compose_shopping': '장보기 구성',
}
MODELS = {
    'find_recipes': RecipeArg,
    'search_items': Search,
    'reference_price': PriceArg,
    'find_stores': ItemArg,
    'active_sales': SaleArg,
    'ask_knowledge': AskArg,
    'compose_shopping': RecommendRequest,
}


def get_tools():
    result = []
    for name, model in MODELS.items():
        schema = model.model_json_schema()
        schema['properties'].pop('market_id', None)
        schema['required'] = [k for k in schema.get('required', []) if k != 'market_id']
        result.append(
            {
                'type': 'function',
                'function': {'name': name, 'description': LABELS[name], 'parameters': schema},
            }
        )
    return result


def execute(conn, market_id, device_id, name, arguments):
    try:
        if name not in MODELS or not isinstance(arguments, dict):
            return {'error': '알 수 없는 도구 또는 잘못된 인자예요.'}
        data = MODELS[name].model_validate(arguments | {'market_id': market_id})
        if getattr(data, 'item_id', None):
            item_service.get_item(conn, data.item_id)
        if name == 'find_recipes':
            return recipe_service.find_recipes(
                conn, item_id=data.item_id, market_id=market_id, q=data.q
            )
        if name == 'search_items':
            return [
                {'item_id': i.item_id, 'name': i.name}
                for i in item_service.search(conn, data.query)[:5]
            ]
        if name == 'reference_price':
            return price_service.get_price(
                conn,
                data.item_id,
                market_id=market_id,
                unit_id=data.unit,
                variety_id=data.variety_id,
            )
        if name == 'active_sales':
            return sale_service.active(conn, market_id, data.item_id)
        if name == 'find_stores':
            sales = {s['store_id'] for s in sale_service.active(conn, market_id, data.item_id)}
            return sorted(
                market_service.selling_stores(conn, market_id, data.item_id),
                key=lambda s: (s['store_id'] not in sales, s['store_id']),
            )[:5]
        if name == 'ask_knowledge':
            return ask_service.ask(
                conn,
                AskRequest(item_id=data.item_id, question=data.question, market_id=market_id),
                device_id,
                consume=False,
            )
        return recommend_service.recommend(conn, data, device_id, consume=False)
    except (ValueError, AppError) as exc:
        return {'error': exc.message if isinstance(exc, AppError) else '도구 인자를 확인해 주세요.'}
