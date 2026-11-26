"""Public item contracts."""

from pydantic import BaseModel


class Criterion(BaseModel):
    key: str
    text: str
    source: str


class Item(BaseModel):
    item_id: str
    name: str
    synonyms: list[str]
    vision_labels: list[str]
    criteria: list[Criterion]
    default_unit: str
    units: list[str]
    labels_i18n: dict[str, str]


class InSeasonItem(BaseModel):
    item_id: str
    name: str
    label: str
