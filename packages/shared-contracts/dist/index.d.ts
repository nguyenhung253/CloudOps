export interface UserDto {
    id: string;
    email: string;
    name?: string;
    createdAt: Date;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
