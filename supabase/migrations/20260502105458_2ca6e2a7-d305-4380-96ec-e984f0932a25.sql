DO $$
DECLARE
  v_target_count INT;
  v_dup_count INT;
  v_mismatch_count INT;
  v_will_update INT;
  v_complete_outbound INT;
  v_updated INT;
  v_history_inserted INT;
  v_executed_at TIMESTAMPTZ := now();
  v_note_tag TEXT;
BEGIN
  v_note_tag := '[legacy_status_cleanup_2026_A1]'
    || ' approved_by=brad'
    || ' executed_by=lovable_migration'
    || ' verified_by=BEGIN_ROLLBACK_preview'
    || ' executed_at=' || v_executed_at::text;

  CREATE TEMP TABLE _a1_target (
    id UUID NOT NULL,
    rma_number TEXT NOT NULL,
    original_proposed_new_status TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _a1_target (id, original_proposed_new_status, rma_number) VALUES
    ('8fac7da6-c0b8-41c8-89b2-3d3131d25797'::uuid, 'closed', 'RC20240821003'),
    ('ed0e68b7-e9fa-4367-9d8b-ed3803f155e7'::uuid, 'closed', 'RC20241014007'),
    ('083d79ab-ff4c-4e35-a936-6974bff61075'::uuid, 'closed', 'RC20241014008'),
    ('10a11e2d-e3e5-470c-a337-b6bce15ad0cf'::uuid, 'closed', 'RC20241014009'),
    ('3533ceca-0655-4aae-b773-05255d69a5fd'::uuid, 'closed', 'RC20241014010'),
    ('6b56f442-73f8-46ce-977b-8e1ec1456b76'::uuid, 'closed', 'RC20241014011'),
    ('8f346d5b-81d5-4f17-97e9-1c8b4c647214'::uuid, 'closed', 'RC20241014012'),
    ('6fa9c006-3365-4b7e-a370-3934865dd3de'::uuid, 'closed', 'RC20241014013'),
    ('5a06f1d4-5db4-4b60-9b87-a6b3a3b93f7c'::uuid, 'closed', 'RC20241014014'),
    ('9d12c92d-f4d8-44fa-af1d-3221a50e9adc'::uuid, 'closed', 'RC20241014015'),
    ('8a7f83c3-6bf1-4215-91c2-2f509e0ce45b'::uuid, 'closed', 'RC20241014016'),
    ('e8cc5416-5b7b-41be-88e3-7bfafc4cf2aa'::uuid, 'closed', 'RC20241014017'),
    ('d7ad1c64-35c6-452c-b6b6-ca3ddb1e1af3'::uuid, 'closed', 'RC20241014018'),
    ('efe31739-77d6-4752-9942-d625d293aa51'::uuid, 'closed', 'RC20241014019'),
    ('1aaa5ba6-3209-40e6-a08d-0cd40366e415'::uuid, 'closed', 'RC20250425049'),
    ('6ad5f467-149e-48eb-b1b3-4325e7756628'::uuid, 'closed', 'RC20250425050'),
    ('1066c6cd-41f5-4a1d-9c69-0df5ce091c03'::uuid, 'closed', 'RC20250425051'),
    ('4d4f9899-4b11-4f3f-8fdf-7ede1f220388'::uuid, 'closed', 'RC20250425052'),
    ('87c1429d-7ff5-40f6-9ade-91d05b90bef9'::uuid, 'closed', 'RC20250425053'),
    ('44838f1a-fc59-4548-9f81-4e3fa533fea0'::uuid, 'closed', 'RC20250425054'),
    ('58f1198a-1c74-4004-90e1-06e84a1d8c67'::uuid, 'closed', 'RC20250425055'),
    ('b4aa22c1-00ab-48a9-a73f-dadacf7df859'::uuid, 'closed', 'RC20250425056'),
    ('73ff5e7a-7878-4dca-b5b7-df8aa9a50bf9'::uuid, 'closed', 'RC20250425057'),
    ('8dc871a2-a521-42be-9c18-aafced2c3d74'::uuid, 'closed', 'RC20250425058'),
    ('c0f01680-8441-4bce-a149-e56f0a1907bd'::uuid, 'closed', 'RC20250425059'),
    ('f62acf04-4a8b-4cb1-989e-b9894a0fb5f1'::uuid, 'closed', 'RC20250425060'),
    ('cf314f2b-8b5a-4a51-854d-40dbb92fda9b'::uuid, 'closed', 'RC20250425061'),
    ('c4d26f90-b6ae-4045-9d28-24663df73d6a'::uuid, 'closed', 'RC20250425062'),
    ('8718f442-a367-44ef-b519-458c7db32847'::uuid, 'closed', 'RC20250425063'),
    ('2b4fe561-1d32-4ece-95b8-5fec703586bb'::uuid, 'closed', 'RC20250425064'),
    ('b447722c-6b22-4df3-96ea-a9c2fd5bd12f'::uuid, 'closed', 'RC20250425065'),
    ('9de0e0c3-2ab9-456b-81f3-4b42abd00c77'::uuid, 'closed', 'RC20250425066'),
    ('59e18a68-5ed6-496c-a0cc-07fb10eaa05d'::uuid, 'closed', 'RC20250425067'),
    ('1d597b91-b70c-4830-85fc-3aab958cdbab'::uuid, 'closed', 'RC20250425068'),
    ('c969d78e-0327-4792-9742-4c6ff18ab395'::uuid, 'closed', 'RC20250413002'),
    ('4a4ff19e-6817-4fbd-b957-5a4034d3c20a'::uuid, 'closed', 'RC20250912004'),
    ('dc01ecc9-aaf3-483b-af90-587b6e2cbd26'::uuid, 'closed', 'RC20250912005'),
    ('3d8d26d8-dd2d-434b-9b10-0fc90cae3e74'::uuid, 'closed', 'RC20250703001'),
    ('6497dd48-0e0c-437a-b061-5211c5c200d9'::uuid, 'closed', 'RC20250703002'),
    ('be9aa5fb-932a-40af-b725-4488478316a0'::uuid, 'closed', 'RC20250703003'),
    ('a7da1421-0a1b-4282-94f1-21c58b92452f'::uuid, 'closed', 'RC20250703004'),
    ('f7d42c54-431b-44de-ad6c-fde41f3698e6'::uuid, 'closed', 'RC20250703005'),
    ('f16a8c71-5adc-4534-848e-11421d3be470'::uuid, 'closed', 'RC20250703006'),
    ('19ed9933-5448-42b1-9aff-917172a8ebe7'::uuid, 'closed', 'RC20250905003'),
    ('c5c3c3f2-f782-495b-8dfa-53e60a4a4a30'::uuid, 'closed', 'RC20250905004'),
    ('707d7526-5966-4da3-a353-c824b47e09c7'::uuid, 'closed', 'RC20250905005'),
    ('5bc7301e-8487-450c-89dc-5312c9a58868'::uuid, 'closed', 'RC20250905006'),
    ('07b7061a-0404-4402-9410-4d525fb57c19'::uuid, 'closed', 'RC20250905007'),
    ('3838f656-1c01-4e64-9a44-61b8dcd1b986'::uuid, 'closed', 'RC20250905008'),
    ('2a59ef63-b533-4fcb-aa13-b1934c904e5a'::uuid, 'closed', 'RC20250905009'),
    ('6e9dbda9-2176-40a4-a690-97aeeac9610c'::uuid, 'closed', 'RC20250905010'),
    ('353c9c74-890d-4964-ad64-df326b10c1f3'::uuid, 'closed', 'RC20250905011'),
    ('01a8b6b6-2e04-48a4-9b32-d10e0e7b90fb'::uuid, 'closed', 'RC20250305003'),
    ('5b0609b9-91bd-4e10-8216-84215d6f82bd'::uuid, 'closed', 'RC20250926001'),
    ('ea31b33c-9fde-411e-887f-535361b2873a'::uuid, 'closed', 'RC20250926002'),
    ('907831b7-6a76-4725-b9c3-25840637fa1a'::uuid, 'closed', 'RC20250926003'),
    ('b2157cad-5e37-4ae6-8c21-e0f5085121d9'::uuid, 'closed', 'RC20250926004'),
    ('bef791a6-f4ea-47be-b7dc-01d704494d56'::uuid, 'closed', 'RC20250926005'),
    ('3a38cf32-c30d-40d9-9da2-c7b287759cb2'::uuid, 'closed', 'RC20250926006'),
    ('2c13edd2-7010-4f53-a411-b8cb4af4462d'::uuid, 'closed', 'RC20250926007'),
    ('75e2c24b-647c-446f-a85f-648b4fd2f775'::uuid, 'closed', 'RC20250516003'),
    ('f616ed44-e6de-4c95-8acd-357874098ff2'::uuid, 'closed', 'RC20250905002'),
    ('3d4d3ed7-d222-4387-8aef-b8ed3998eec0'::uuid, 'closed', 'RC20251023002'),
    ('25b1f7c3-2fcd-451e-a231-2362066e8eab'::uuid, 'closed', 'RC20241213003'),
    ('ced78dd1-aea9-4a09-84fd-48869cdb380c'::uuid, 'closed', 'RC20250509003'),
    ('3f5fff86-6216-4ae6-8096-eabd97750c57'::uuid, 'closed', 'RC20251013003'),
    ('b057908a-244d-42df-bcb4-8a233477b150'::uuid, 'closed', 'RC20250320001'),
    ('9ef59174-b854-485b-8192-6ca3038522b4'::uuid, 'closed', 'RC20250916002'),
    ('540b086c-87af-4976-8fb5-cdd7a768cb7e'::uuid, 'closed', 'RC20251015006'),
    ('d8aa818a-16ed-4553-8ab4-727b21e09a7f'::uuid, 'closed', 'RC20241023006'),
    ('51d63185-d733-44c2-aac9-a51ddec8aeac'::uuid, 'closed', 'RC20241213002'),
    ('df1569b8-d1c6-438b-bf95-2ba9b4c1894f'::uuid, 'closed', 'RC20250912001'),
    ('9f4ba29c-463b-404c-9bbb-1f331a2aa8f3'::uuid, 'closed', 'RC20250912003'),
    ('b027a290-e73b-4643-8dee-e01130502bd9'::uuid, 'closed', 'RC20250611001'),
    ('ff1ff349-1a33-4a0e-819f-a2a8239e4886'::uuid, 'closed', 'RC20250515001'),
    ('eb7fe497-adeb-40c9-add9-aef5e3c76956'::uuid, 'closed', 'RC20250902002'),
    ('a7adb068-ffa9-4ccf-962d-ba081bcbac57'::uuid, 'closed', 'RC20250425047'),
    ('e5449c83-6eb1-4bef-b64f-c2482e181136'::uuid, 'closed', 'RC20250606005'),
    ('e6c8b5d9-7e11-420c-81a0-b9f0228146b3'::uuid, 'closed', 'RC20251014001'),
    ('ebaaaf2b-fe5f-42b1-a6ff-1768a7e970f0'::uuid, 'closed', 'RC20250305001'),
    ('d0719635-00b9-4fe6-90e9-b55b57d13c6f'::uuid, 'closed', 'RC20250829006'),
    ('e21f5834-a24a-4980-9b7d-95e764390390'::uuid, 'closed', 'RC20251023001'),
    ('5b09f36e-8af8-4566-b24f-f3e17179b3a6'::uuid, 'closed', 'RC20250514001'),
    ('182ce082-7f25-4a6c-be62-0ebc13e854cd'::uuid, 'closed', 'RC20250605003'),
    ('70daf021-1440-4223-a4c8-2e68b8a4b19f'::uuid, 'closed', 'RC20251023006'),
    ('29dd3a0a-ec08-4d54-b289-16a562010460'::uuid, 'closed', 'RC20250919001'),
    ('ddae0d47-138c-4b9b-b4c9-c185c6bb6268'::uuid, 'closed', 'RC20250509001'),
    ('9db0bd78-319e-4aa6-b5ce-f4b39edf0a9e'::uuid, 'closed', 'RC20250606002'),
    ('8642851a-f029-4b5a-8e15-d4b49d470f17'::uuid, 'closed', 'RC20250606003'),
    ('cc91b4dc-6230-4b37-8af2-a9ae8095d70d'::uuid, 'closed', 'RC20250407007'),
    ('3ffa3df1-cec5-47c7-8ea8-5c5d7e76b278'::uuid, 'closed', 'RC20250425048'),
    ('621d102b-29c0-4426-8ca4-ec8575161d2a'::uuid, 'closed', 'RC20250507002'),
    ('cd3d88a5-1665-4c4b-a31c-8cff309a45f8'::uuid, 'closed', 'RC20250507003'),
    ('0f115d1c-a3c5-4c95-9970-a60dc3387e19'::uuid, 'closed', 'RC20250507005'),
    ('a57490e7-39dd-4b62-a912-872fca50fee9'::uuid, 'closed', 'RC20250510001'),
    ('b5121cea-c2ee-4e9e-b864-57242b28d99f'::uuid, 'closed', 'RC20250704001'),
    ('0c3e7948-9e29-4404-aaa7-4662a6ff4ef7'::uuid, 'closed', 'RC20250827004'),
    ('2f6ec8d0-36fb-48be-9a24-300b4b59c39e'::uuid, 'closed', 'RC20250829001'),
    ('ff3ab7a6-ae25-49ec-8ee4-49bc07d80ef0'::uuid, 'closed', 'RC20250910001'),
    ('5346ee0b-c989-45c0-a0a0-a303f2c25c12'::uuid, 'closed', 'RC20250916001'),
    ('c1abc463-749c-47ce-8c7a-656ebe8e9e3a'::uuid, 'closed', 'RC20250922001'),
    ('7126252c-fa9e-45ac-b4e6-9823f75b1b7a'::uuid, 'closed', 'RC20250630001'),
    ('c3935488-c877-4683-a0a6-8ef6c15e2068'::uuid, 'closed', 'RC20250502007'),
    ('55ea6822-f44a-4f79-9128-08bc652336d7'::uuid, 'closed', 'RC20250502008'),
    ('44675931-0f42-4b71-b007-e8ecf12b71f8'::uuid, 'closed', 'RC20250902001'),
    ('40a4b08b-4fd0-4629-ad4d-d6e751940330'::uuid, 'closed', 'RC20250916003'),
    ('d9a1d81e-4a10-4411-8c80-e138c7fdb15e'::uuid, 'closed', 'RC20250610004'),
    ('5895b5ec-c9ed-4545-8977-4d0d40db0d06'::uuid, 'closed', 'RC20250905001'),
    ('ab052273-689d-449c-8842-6af7f7f6f2fe'::uuid, 'closed', 'RC20241213006'),
    ('5cd10381-ee36-48f3-973e-b56f515453da'::uuid, 'closed', 'RC20251023004'),
    ('7d383097-573a-47ed-89a8-920bc2439834'::uuid, 'closed', 'RC20250829003'),
    ('5c9bf5e6-2855-4025-9a73-cbd9abd74f49'::uuid, 'closed', 'RC20250116003'),
    ('b39a755a-3286-4848-844a-76d1534c5f25'::uuid, 'closed', 'RC20241129002'),
    ('6cd1c1bd-317f-4c2d-85de-59558582503e'::uuid, 'closed', 'RC20250912002'),
    ('2a833cd4-2c11-4bd5-b366-81448ace1640'::uuid, 'closed', 'RC20250425046'),
    ('c84792ed-d311-4d8e-8cac-a4e879e831fd'::uuid, 'closed', 'RC20250919002'),
    ('5bc27427-de16-41f5-a9e0-581020d69345'::uuid, 'closed', 'RC20250923001'),
    ('e05a29cc-b3ee-422f-969e-23cf6fb16f66'::uuid, 'closed', 'RC20250502006'),
    ('25015da3-cd14-4d34-9002-9d93e5b8e273'::uuid, 'closed', 'RC20250208001'),
    ('010c1b0a-17b4-4e2c-8d6b-d13e8a013a7c'::uuid, 'closed', 'RC20251022002'),
    ('ecde673f-e188-4bff-bffa-f650b487f27d'::uuid, 'closed', 'RC20241213001'),
    ('5d2c89ec-0504-4897-bf8a-3542472dd035'::uuid, 'closed', 'RC20251027001'),
    ('7a7e9217-6dac-4ca7-8087-6c79ce663783'::uuid, 'closed', 'RC20250507006'),
    ('e10fa13f-07fd-4095-b6bc-525f29426b4c'::uuid, 'closed', 'RC20241213004'),
    ('020003c2-872d-4dad-a48c-7be1e342b0a5'::uuid, 'closed', 'RC20250422001'),
    ('989020d9-d13c-46ee-b756-b8468a8d7e3f'::uuid, 'closed', 'RC20250915001'),
    ('fd42b7a1-14b7-4e3e-99df-e91f8fbac059'::uuid, 'closed', 'RC20250327001'),
    ('32b61501-c52e-47c4-8b51-e91864dff803'::uuid, 'closed', 'RC20251022001'),
    ('387ae5e4-33ce-40b2-8007-995c1b508531'::uuid, 'closed', 'RC20251110007'),
    ('6e26636d-7a7c-45bf-998f-975b25237d3a'::uuid, 'closed', 'RC20250908001'),
    ('6196dbfd-d4b8-4cb7-bc13-1e10eae130f7'::uuid, 'closed', 'RC20250509002'),
    ('7401c432-5b56-474a-aaf2-2d7b27614cfa'::uuid, 'closed', 'RC20250904001'),
    ('8e05828d-15b7-4238-8b6a-67abfb21fe24'::uuid, 'closed', 'RC20241113003'),
    ('ccd9ba8a-64a4-4463-906b-78770bc55497'::uuid, 'closed', 'RC20250505001'),
    ('c1c246d5-91fb-492a-8fd4-d834fb0cd25b'::uuid, 'shipped_back_refurbished', 'RC20241216001'),
    ('82dc520b-18b8-4ecf-94cf-b9a5d7f9e916'::uuid, 'shipped_back_refurbished', 'RC20250331006');

  SELECT count(*) INTO v_target_count FROM _a1_target;
  IF v_target_count <> 136 THEN
    RAISE EXCEPTION 'A1 abort: target_count=% expected 136', v_target_count;
  END IF;

  SELECT COALESCE(SUM(c - 1), 0)::int INTO v_dup_count FROM (
    SELECT count(*) AS c FROM _a1_target GROUP BY id HAVING count(*) > 1
  ) d;
  IF v_dup_count <> 0 THEN
    RAISE EXCEPTION 'A1 abort: duplicate ids=%', v_dup_count;
  END IF;

  SELECT count(*) INTO v_mismatch_count
  FROM _a1_target t
  JOIN public.rma_requests r ON r.id = t.id
  WHERE r.rma_number <> t.rma_number;
  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'A1 abort: id/rma_number mismatch=%', v_mismatch_count;
  END IF;

  SELECT count(*) INTO v_will_update
  FROM _a1_target t
  JOIN public.rma_requests r
    ON r.id = t.id AND r.rma_number = t.rma_number
  WHERE r.status = 'received';
  IF v_will_update <> 136 THEN
    RAISE EXCEPTION 'A1 abort: will_update=% expected 136', v_will_update;
  END IF;

  SELECT count(*) INTO v_complete_outbound
  FROM _a1_target t
  JOIN public.rma_requests r
    ON r.id = t.id AND r.rma_number = t.rma_number
  WHERE r.status = 'received'
    AND EXISTS (
      SELECT 1 FROM public.rma_shipping s
      WHERE s.rma_request_id = r.id
        AND s.direction = 'outbound'
        AND s.carrier IS NOT NULL AND btrim(s.carrier) <> ''
        AND s.tracking_number IS NOT NULL AND btrim(s.tracking_number) <> ''
        AND s.ship_date IS NOT NULL
    );
  IF v_complete_outbound <> 136 THEN
    RAISE EXCEPTION 'A1 abort: complete_outbound=% expected 136', v_complete_outbound;
  END IF;

  WITH upd AS (
    UPDATE public.rma_requests r
    SET status = 'closed',
        customer_notes = CASE
          WHEN r.customer_notes IS NULL OR btrim(r.customer_notes) = ''
            THEN v_note_tag || ' original_proposed_new_status=' || t.original_proposed_new_status
          ELSE r.customer_notes || E'\n'
            || v_note_tag || ' original_proposed_new_status=' || t.original_proposed_new_status
        END,
        updated_at = now()
    FROM _a1_target t
    WHERE r.id = t.id
      AND r.rma_number = t.rma_number
      AND r.status = 'received'
      AND EXISTS (
        SELECT 1 FROM public.rma_shipping s
        WHERE s.rma_request_id = r.id
          AND s.direction = 'outbound'
          AND s.carrier IS NOT NULL AND btrim(s.carrier) <> ''
          AND s.tracking_number IS NOT NULL AND btrim(s.tracking_number) <> ''
          AND s.ship_date IS NOT NULL
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_updated FROM upd;
  IF v_updated <> 136 THEN
    RAISE EXCEPTION 'A1 abort: updated=% expected 136', v_updated;
  END IF;

  WITH ins AS (
    INSERT INTO public.rma_status_history (rma_request_id, status, notes)
    SELECT t.id, 'closed'::rma_status,
           v_note_tag || ' original_proposed_new_status=' || t.original_proposed_new_status
    FROM _a1_target t
    RETURNING id
  )
  SELECT count(*) INTO v_history_inserted FROM ins;
  IF v_history_inserted <> 136 THEN
    RAISE EXCEPTION 'A1 abort: history_inserted=% expected 136', v_history_inserted;
  END IF;

  RAISE NOTICE 'A1 cleanup OK: updated=% explicit_history=%', v_updated, v_history_inserted;
END $$;