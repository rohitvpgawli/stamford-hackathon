export type Channel = 'sms' | 'web';
export type UserStatus = 'active' | 'opted_out' | 'blocked';
export type SessionState = 'new' | 'awaiting_name' | 'discovering' | 'awaiting_confirmation' | 'joined' | 'limited' | 'closed';
export type OpportunityKind = 'event' | 'place' | 'volunteer' | 'campus' | 'mango_plan';
export type OpportunityStatus = 'active' | 'canceled' | 'sold_out' | 'expired';
export type Intent = 'COMMAND_STOP'|'COMMAND_START'|'COMMAND_HELP'|'COMMAND_RESET'|'PROVIDE_NAME'|'DISCOVER_ACTIVITY'|'DISCOVER_PLACE'|'SOCIAL_MATCH'|'CIVIC_VOLUNTEER'|'STUDENT_GAP'|'MORE_OPTIONS'|'REJECT_RECOMMENDATION'|'JOIN_PLAN'|'LEAVE_PLAN'|'APP_OR_CALENDAR'|'PRODUCT_QUESTION'|'GREETING_OR_SMALLTALK'|'SAFETY_HIGH_RISK'|'ABUSE_OR_SEXUAL'|'OFF_TOPIC'|'PROMPT_INJECTION'|'UNKNOWN';

export interface CanonicalInbound {
  provider: string;
  provider_message_id: string;
  from: string;
  to?: string;
  text: string;
  received_at?: string;
  device_id?: string;
}
export interface OutboundSendInput { userId: string; encryptedDestination: string; text: string; dedupeKey: string; }
export interface OutboundSendResult { providerMessageId: string; acceptedAt: string; }
export interface ChannelAdapter { sendText(input: OutboundSendInput): Promise<OutboundSendResult>; }
export interface HermesContext { user: { id: string; display_name?: string; user_type?: string; known_preferences: Array<{key:string;value:unknown;confidence:number}> }; session: {id:string;state:SessionState;turn:number;max_turns:number;recommendation_count:number;active_recommendation_id?:string}; current_message:string; intent:Intent; allowed_actions:string[]; candidate_results: unknown[]; recent_summary?:string; }
export interface HermesOutput { action:'RESPOND'|'ASK_FOLLOWUP'|'RECOMMEND'|'EXPLAIN'|'REDIRECT'|'APP_UPSELL'|'NO_RESULT'; reply_text:string; opportunity_id:string|null; match_type:'exact'|'adjacent'|'none'; profile_updates:Array<{key:string;value:unknown;confidence:number}>; needs_confirmation:boolean; }
