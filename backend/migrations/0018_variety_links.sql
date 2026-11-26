-- 품목 소속 품종 및 판매 품목 제약.
alter table closing_sales add column variety_id text references entities(id);
create table store_item_varieties (
 store_id text not null,
 item_id text not null,
 variety_id text not null references entities(id),
 primary key(store_id,item_id,variety_id),
 foreign key(store_id,item_id) references store_items(store_id,item_id) on delete cascade
);
create function validate_item_variety() returns trigger language plpgsql as $$
begin
 if new.variety_id is not null and not exists (
 select 1 from entity_relations r join entities e on e.id=r.object_id
 where r.subject_id=new.item_id and r.object_id=new.variety_id
 and r.predicate='hasGrade' and e.type='variety') then
 raise exception 'variety does not belong to item' using errcode='23514';
 end if;
 return new;
end $$;
create trigger closing_sale_variety before insert or update on closing_sales
 for each row execute function validate_item_variety();
create trigger store_item_variety before insert or update on store_item_varieties
 for each row execute function validate_item_variety();
