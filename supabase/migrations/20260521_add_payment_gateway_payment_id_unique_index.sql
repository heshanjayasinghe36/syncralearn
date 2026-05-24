create unique index if not exists payment_gateway_payment_id_key
on public.payment (gateway_payment_id)
where gateway_payment_id is not null;
