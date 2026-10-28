// Observation templates, sections, and criteria (backend/app/api/templates.py).
// A template locks once a completed observation used it; edit a new version instead.

import { apiDelete, apiGet, apiPost, apiPut } from './client'
import type { RatingOption } from './observations'

export const APPLIES_TO = ['All', 'In person', 'Online / Hybrid'] as const
export type AppliesTo = (typeof APPLIES_TO)[number]

export interface TemplateInfo {
  template_id: number
  version: string
  content: string | null
  is_active: boolean
  is_locked: boolean
  last_updated: string | null
  cycle_ids: number[]
  observation_count: number
}

export interface TemplateSection {
  section_id: number
  name: string
  display_order: number | null
}

export interface TemplateCriterion {
  criterion_id: number
  template_id: number
  name: string
  description: string | null
  section_id: number | null
  display_order: number | null
  guidance: string | null
  applies_to: AppliesTo
  is_active: boolean
  is_required: boolean
  notes_on_low_rating: boolean
  bullets: string[]
  /** Number of ratings that reference this criterion. */
  used_in: number
}

export interface FullTemplate extends TemplateInfo {
  rating_scale: RatingOption[]
  sections: TemplateSection[]
  criteria: TemplateCriterion[]
}

export interface CriterionFields {
  name: string
  description?: string | null
  section_id?: number | null
  display_order?: number | null
  guidance?: string | null
  applies_to?: AppliesTo
  is_active?: boolean
  is_required?: boolean
  notes_on_low_rating?: boolean
  bullets?: string[]
}

export function listTemplates(signal?: AbortSignal) {
  return apiGet<{ templates: TemplateInfo[] }>('/api/templates', undefined, signal)
}

/** The current cycle's template. Throws ApiError 404 if the cycle has none. */
export function getCurrentTemplate(signal?: AbortSignal) {
  return apiGet<FullTemplate & { cycle_id: number }>('/api/templates/current', undefined, signal)
}

export function getTemplate(templateId: number, signal?: AbortSignal) {
  return apiGet<FullTemplate>(`/api/templates/${templateId}`, undefined, signal)
}

export function createTemplateVersion(templateId: number, version: string, signal?: AbortSignal) {
  return apiPost<FullTemplate>(`/api/templates/${templateId}/versions`, { version }, undefined, signal)
}

/** Throws ApiError 409 once the cycle has observations. */
export function setCycleTemplate(cycleId: number, templateId: number, signal?: AbortSignal) {
  return apiPut<FullTemplate & { cycle_id: number }>(
    `/api/evaluation-cycles/${cycleId}/template`,
    { template_id: templateId },
    undefined,
    signal,
  )
}

export function addSection(templateId: number, name: string, signal?: AbortSignal) {
  return apiPost<FullTemplate>(`/api/templates/${templateId}/sections`, { name }, undefined, signal)
}

export function deleteSection(sectionId: number, signal?: AbortSignal) {
  return apiDelete<FullTemplate>(`/api/sections/${sectionId}`, undefined, signal)
}

export function addCriterion(templateId: number, fields: CriterionFields, signal?: AbortSignal) {
  return apiPost<FullTemplate>(`/api/templates/${templateId}/criteria`, fields, undefined, signal)
}

export function updateCriterion(criterionId: number, fields: Partial<CriterionFields>, signal?: AbortSignal) {
  return apiPut<FullTemplate>(`/api/criteria/${criterionId}`, fields, undefined, signal)
}

/** Throws ApiError 409 if the criterion already has a rating; mark it inactive instead. */
export function deleteCriterion(criterionId: number, signal?: AbortSignal) {
  return apiDelete<FullTemplate>(`/api/criteria/${criterionId}`, undefined, signal)
}
