import { NextResponse } from 'next/server';
import { openApiDocument } from '@/src/interface/http/openapi';

/** The machine-readable spec, also consumable by Postman, Insomnia or codegen. */
export const GET = () => NextResponse.json(openApiDocument);
