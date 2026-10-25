\set ON_ERROR_STOP on

SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'nucleo_iot_test'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS nucleo_iot_test;

CREATE DATABASE nucleo_iot_test OWNER nucleo_iot;
